import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  addDays,
  currentTime,
  formatDateEs,
  fromDbDate,
  todayIso,
  toDbDate,
} from '@Common/time';
import { badRequest } from '@Common/validation';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { PrismaService } from '@Prisma/services';
import {
  Prisma,
  Role,
  VisitOrigin,
  VisitStatus,
  type User,
} from '@PrismaClient';
import type { CreateVisitDto, VisitCreatedDto } from './dto/index.js';
import {
  MAX_DAYS_AHEAD,
  TIME_STEP_MINUTES,
  VISIT_CODE_MAX_ATTEMPTS,
  VISIT_HOURS,
  VISIT_MESSAGES,
} from './visits.constants.js';
import {
  condominiumInstant,
  documentLabel,
  generateVisitCode,
  normalizeDocument,
  toMinutes,
  visitSearchKey,
} from './visits.utils.js';

// Prisma marca una violación de restricción única con este código.
const PRISMA_UNIQUE_VIOLATION = 'P2002';

const CREATED_SELECT = {
  id: true,
  code: true,
  status: true,
  visitorName: true,
  documentType: true,
  documentNumber: true,
  reason: true,
  visitDate: true,
  expectedTime: true,
  validFrom: true,
  validUntil: true,
  unit: { select: { code: true } },
} satisfies Prisma.VisitSelect;

type CreatedVisit = Prisma.VisitGetPayload<{ select: typeof CREATED_SELECT }>;

/** El choque es en `code`, no en otra columna única. */
function isCodeCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== PRISMA_UNIQUE_VIOLATION) return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  // Sin detalle del índice se asume el código: es la única columna única que se escribe.
  return target === undefined || JSON.stringify(target).includes('code');
}

/**
 * Preautorización de visitantes (H14). El residente autoriza una visita para
 * su unidad; seguridad recibe un aviso con el código que el visitante
 * presenta en portería.
 */
@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Reglas que dependen de "ahora": fecha de hoy a hoy + 30 días; hora de
   * 06:00 a 22:00 en pasos de 15 minutos y, si es hoy, no anterior a la
   * hora actual. Responde 400 con el campo que falló.
   */
  validateSchedule(
    dto: Pick<CreateVisitDto, 'visitDate' | 'expectedTime'>,
    now: Date,
  ): void {
    const today = todayIso(now);
    const limit = addDays(today, MAX_DAYS_AHEAD);
    if (dto.visitDate < today || dto.visitDate > limit) {
      throw badRequest(
        'visitDate',
        VISIT_MESSAGES.dateRange(formatDateEs(limit)),
      );
    }

    const minutes = toMinutes(dto.expectedTime);
    if (
      minutes < toMinutes(VISIT_HOURS.from) ||
      minutes > toMinutes(VISIT_HOURS.until)
    ) {
      throw badRequest('expectedTime', VISIT_MESSAGES.hours);
    }
    if (minutes % TIME_STEP_MINUTES !== 0) {
      throw badRequest('expectedTime', VISIT_MESSAGES.timeStep);
    }
    if (dto.visitDate === today && minutes < toMinutes(currentTime(now))) {
      throw badRequest('expectedTime', VISIT_MESSAGES.timePassed);
    }
  }

  async create(
    resident: User,
    dto: CreateVisitDto,
    now = new Date(),
  ): Promise<VisitCreatedDto> {
    if (!resident.unitId) throw new ForbiddenException(VISIT_MESSAGES.noUnit);
    this.validateSchedule(dto, now);

    const unitId = resident.unitId;
    const documentNumber = normalizeDocument(
      dto.documentType,
      dto.documentNumber,
    );
    const visitDate = toDbDate(dto.visitDate);

    // Mismo documento, misma unidad y misma fecha mientras la primera siga
    // Autorizada: 409.
    const duplicate = await this.prisma.visit.findFirst({
      where: {
        unitId,
        documentType: dto.documentType,
        documentNumber,
        visitDate,
        status: VisitStatus.AUTORIZADA,
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException(VISIT_MESSAGES.duplicate);

    const data = {
      origin: VisitOrigin.PREAUTORIZADA,
      status: VisitStatus.AUTORIZADA,
      unitId,
      createdById: resident.id,
      visitorName: dto.visitorName,
      documentType: dto.documentType,
      documentNumber,
      reason: dto.reason,
      searchKey: visitSearchKey(dto.visitorName, documentNumber),
      visitDate,
      expectedTime: dto.expectedTime,
      validFrom: condominiumInstant(dto.visitDate, VISIT_HOURS.from),
      validUntil: condominiumInstant(dto.visitDate, VISIT_HOURS.until),
    } satisfies Prisma.VisitUncheckedCreateInput;

    const visit = await this.insertWithUniqueCode(data);
    await this.notifySecurity(visit);

    return {
      id: visit.id,
      code: visit.code ?? '',
      status: visit.status,
      visitorName: visit.visitorName,
      visitDate: fromDbDate(visit.visitDate),
      expectedTime: visit.expectedTime ?? dto.expectedTime,
      validFrom: visit.validFrom.toISOString(),
      validUntil: visit.validUntil.toISOString(),
    };
  }

  /** Inserta con un código nuevo; si choca con otro, reintenta con otro código. */
  private async insertWithUniqueCode(
    data: Omit<Prisma.VisitUncheckedCreateInput, 'code'>,
  ): Promise<CreatedVisit> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.visit.create({
          data: { ...data, code: generateVisitCode() },
          select: CREATED_SELECT,
        });
      } catch (error) {
        if (!isCodeCollision(error) || attempt >= VISIT_CODE_MAX_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  /**
   * Avisa a todo el Personal de seguridad activo (H30). Va después de guardar:
   * si el aviso falla, la autorización ya quedó y solo se deja constancia en
   * el registro del servidor.
   */
  private async notifySecurity(visit: CreatedVisit): Promise<void> {
    try {
      const guards = await this.prisma.user.findMany({
        where: { role: Role.SEGURIDAD, isActive: true },
        select: { id: true },
      });
      if (guards.length === 0) return;

      const unit = visit.unit.code;
      await this.notifications.send({
        recipient: {
          type: RecipientType.USUARIO,
          ids: guards.map((g) => g.id),
        },
        title: `Visita autorizada: ${unit}`,
        message:
          `${visit.visitorName} (${documentLabel(visit.documentType, visit.documentNumber)}) ` +
          `visitará ${unit} el ${formatDateEs(fromDbDate(visit.visitDate))}, ` +
          `hora estimada ${visit.expectedTime}. Motivo: ${visit.reason}. ` +
          `Código: ${visit.code}.`,
        sourceModule: SourceModule.VISITAS,
        reference: { type: 'visit', id: visit.id },
      });
    } catch (error) {
      this.logger.error(
        `Visita ${visit.id} autorizada, pero falló el aviso a seguridad`,
        error as Error,
      );
    }
  }
}
