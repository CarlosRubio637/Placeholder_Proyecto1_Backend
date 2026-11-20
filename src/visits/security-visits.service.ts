import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { currentTime, todayIso, toDbDate } from '@Common/time';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { PrismaService } from '@Prisma/services';
import {
  Prisma,
  VisitOrigin,
  VisitStatus,
  type DocumentType,
  type User,
} from '@PrismaClient';
import type {
  CreateVisitRequestDto,
  SecurityVisitDto,
  SecurityVisitListDto,
  VisitEntryDto,
  VisitExitDto,
  VisitRequestCreatedDto,
  VisitRequestListDto,
} from './dto/index.js';
import {
  ENTRY_MESSAGES,
  EXIT_MESSAGES,
  REQUEST_RESPONSE_MINUTES,
  VISIT_HOURS,
  VISIT_STATUS_LABELS,
} from './visits.constants.js';
import {
  condominiumInstant,
  documentLabel,
  normalizeDocument,
  toMinutes,
  visitSearchKey,
} from './visits.utils.js';

const VISIT_SELECT = {
  id: true,
  code: true,
  origin: true,
  visitorName: true,
  documentType: true,
  documentNumber: true,
  reason: true,
  visitDate: true,
  status: true,
  validFrom: true,
  validUntil: true,
  rejectReason: true,
  createdAt: true,
  unit: { select: { code: true } },
} satisfies Prisma.VisitSelect;

type SelectedVisit = Prisma.VisitGetPayload<{ select: typeof VISIT_SELECT }>;

/** Copia plana del DTO (no una instancia de clase), para extenderla con spread. */
type SecurityVisitData = { [K in keyof SecurityVisitDto]: SecurityVisitDto[K] };

const RESPONSE_MS = REQUEST_RESPONSE_MINUTES * 60 * 1000;

/** 409 con el estado actual de la visita, como pide H16. */
function wrongStatus(status: VisitStatus): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    message: ENTRY_MESSAGES.wrongStatus(VISIT_STATUS_LABELS[status]),
    status,
  });
}

/**
 * Portería (H16): seguridad busca autorizaciones, envía solicitudes para
 * visitantes sin autorización previa y registra la entrada.
 */
@Injectable()
export class SecurityVisitsService {
  private readonly logger = new Logger(SecurityVisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Visitas de hoy cuyo código o documento coincide exactamente. */
  async search(q: string, now = new Date()): Promise<SecurityVisitListDto> {
    const visits = await this.prisma.visit.findMany({
      where: {
        visitDate: toDbDate(todayIso(now)),
        OR: [{ code: q }, { documentNumber: q }],
      },
      orderBy: { createdAt: 'desc' },
      select: VISIT_SELECT,
    });
    return { data: visits.map(toSecurityVisit) };
  }

  /** Solicitudes sin autorización previa de hoy, la más reciente primero. */
  async listRequests(now = new Date()): Promise<VisitRequestListDto> {
    const visits = await this.prisma.visit.findMany({
      where: {
        origin: VisitOrigin.SIN_AUTORIZACION_PREVIA,
        visitDate: toDbDate(todayIso(now)),
      },
      orderBy: { createdAt: 'desc' },
      select: VISIT_SELECT,
    });
    return {
      data: visits.map((visit) => ({
        ...toSecurityVisit(visit),
        rejectReason: visit.rejectReason,
        createdAt: visit.createdAt,
        expiresAt:
          visit.status === VisitStatus.PENDIENTE_AUTORIZACION
            ? new Date(visit.createdAt.getTime() + RESPONSE_MS)
            : null,
      })),
    };
  }

  /**
   * Solicitud para un visitante sin autorización (H16). Queda Pendiente de
   * autorización y se avisa a los residentes de la unidad (H30).
   */
  async createRequest(
    guard: User,
    dto: CreateVisitRequestDto,
    now = new Date(),
  ): Promise<VisitRequestCreatedDto> {
    const minutes = toMinutes(currentTime(now));
    if (
      minutes < toMinutes(VISIT_HOURS.from) ||
      minutes >= toMinutes(VISIT_HOURS.until)
    ) {
      throw new ConflictException(ENTRY_MESSAGES.outsideHours);
    }

    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: {
        id: true,
        code: true,
        _count: { select: { residents: { where: { isActive: true } } } },
      },
    });
    if (!unit) throw new NotFoundException(ENTRY_MESSAGES.unitNotFound);
    if (unit._count.residents === 0) {
      throw new ConflictException(ENTRY_MESSAGES.unitWithoutResidents);
    }

    const documentNumber = normalizeDocument(
      dto.documentType,
      dto.documentNumber,
    );
    if (await this.isInside(this.prisma, dto.documentType, documentNumber)) {
      throw new ConflictException(ENTRY_MESSAGES.alreadyInside);
    }

    const today = todayIso(now);
    const visit = await this.prisma.visit.create({
      data: {
        origin: VisitOrigin.SIN_AUTORIZACION_PREVIA,
        status: VisitStatus.PENDIENTE_AUTORIZACION,
        unitId: unit.id,
        createdById: guard.id,
        visitorName: dto.visitorName,
        documentType: dto.documentType,
        documentNumber,
        reason: dto.reason,
        searchKey: visitSearchKey(dto.visitorName, documentNumber),
        visitDate: toDbDate(today),
        // Si el residente aprueba (H15), vale hasta las 22:00 de hoy.
        validFrom: condominiumInstant(today, VISIT_HOURS.from),
        validUntil: condominiumInstant(today, VISIT_HOURS.until),
      },
      select: VISIT_SELECT,
    });

    await this.notifyResidents(unit.id, visit);
    return {
      id: visit.id,
      status: visit.status,
      unitCode: visit.unit.code,
      expiresAt: new Date(visit.createdAt.getTime() + RESPONSE_MS),
    };
  }

  /**
   * Registra la entrada (H16): Autorizada → Dentro con la hora del servidor y
   * el agente. La revisión de "ya está dentro" y el cambio van en la misma
   * transacción, con un candado por documento para que dos entradas del mismo
   * visitante no pasen a la vez.
   */
  async registerEntry(
    guard: User,
    visitId: string,
    now = new Date(),
  ): Promise<VisitEntryDto> {
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.findUnique({
        where: { id: visitId },
        select: {
          id: true,
          status: true,
          documentType: true,
          documentNumber: true,
          validFrom: true,
          validUntil: true,
        },
      });
      if (!visit) throw new NotFoundException(ENTRY_MESSAGES.visitNotFound);

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${visit.documentType}:${visit.documentNumber}`}))`;

      if (visit.status !== VisitStatus.AUTORIZADA) {
        throw wrongStatus(visit.status);
      }
      if (now < visit.validFrom || now > visit.validUntil) {
        throw new ConflictException(ENTRY_MESSAGES.notValidNow);
      }
      if (await this.isInside(tx, visit.documentType, visit.documentNumber)) {
        throw new ConflictException(ENTRY_MESSAGES.alreadyInside);
      }

      // Condicionada por el estado: si otra petición la cambió entretanto,
      // no toca nada y responde con el estado que tiene ahora.
      const { count } = await tx.visit.updateMany({
        where: { id: visit.id, status: VisitStatus.AUTORIZADA },
        data: { status: VisitStatus.DENTRO, entryAt: now, entryById: guard.id },
      });
      if (count === 0) {
        const current = await tx.visit.findUniqueOrThrow({
          where: { id: visit.id },
          select: { status: true },
        });
        throw wrongStatus(current.status);
      }

      return { id: visit.id, status: VisitStatus.DENTRO, entryAt: now };
    });
  }

  /**
   * Registra la salida de un visitante (H17): la visita pasa de Dentro a
   * Finalizada con la hora del servidor y el agente que la registra.
   *
   * La actualización está condicionada por status = DENTRO en una sola
   * sentencia: si dos agentes registran la misma salida a la vez, solo la
   * primera afecta la fila y la otra recibe 409.
   */
  async registerExit(
    guard: User,
    visitId: string,
    now = new Date(),
  ): Promise<VisitExitDto> {
    const { count } = await this.prisma.visit.updateMany({
      where: { id: visitId, status: VisitStatus.DENTRO },
      data: { status: VisitStatus.FINALIZADA, exitAt: now, exitById: guard.id },
    });

    if (count === 0) {
      // No se actualizó nada: o no existe (404) o no está Dentro (409).
      const exists = await this.prisma.visit.findUnique({
        where: { id: visitId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException(EXIT_MESSAGES.visitNotFound);
      throw new ConflictException(EXIT_MESSAGES.notInside);
    }

    const visit = await this.prisma.visit.findUniqueOrThrow({
      where: { id: visitId },
      select: { id: true, entryAt: true, exitAt: true },
    });
    return {
      id: visit.id,
      status: VisitStatus.FINALIZADA,
      entryAt: visit.entryAt,
      exitAt: visit.exitAt ?? now,
    };
  }

  /** ¿El visitante tiene otra visita Dentro, en cualquier unidad? */
  private async isInside(
    client: Pick<Prisma.TransactionClient, 'visit'>,
    documentType: DocumentType,
    documentNumber: string,
  ): Promise<boolean> {
    const inside = await client.visit.findFirst({
      where: { status: VisitStatus.DENTRO, documentType, documentNumber },
      select: { id: true },
    });
    return inside !== null;
  }

  /**
   * "Visitante en portería" a los residentes activos de la unidad (H30). Va
   * después de guardar: si falla, la solicitud ya quedó y solo se registra.
   */
  private async notifyResidents(
    unitId: string,
    visit: SelectedVisit,
  ): Promise<void> {
    try {
      await this.notifications.send({
        recipient: { type: RecipientType.UNIDAD, ids: [unitId] },
        title: 'Visitante en portería',
        message:
          `${visit.visitorName} (${documentLabel(visit.documentType, visit.documentNumber)}) ` +
          `quiere visitar tu unidad. Motivo: ${visit.reason}. ` +
          `Responde en ${REQUEST_RESPONSE_MINUTES} minutos.`,
        sourceModule: SourceModule.VISITAS,
        reference: { type: 'visit', id: visit.id },
      });
    } catch (error) {
      this.logger.error(
        `Solicitud ${visit.id} creada, pero falló el aviso a la unidad`,
        error as Error,
      );
    }
  }
}

function toSecurityVisit(visit: SelectedVisit): SecurityVisitData {
  return {
    id: visit.id,
    code: visit.code,
    origin: visit.origin,
    visitorName: visit.visitorName,
    documentType: visit.documentType,
    documentNumber: visit.documentNumber,
    unitCode: visit.unit.code,
    reason: visit.reason,
    visitDate: visit.visitDate.toISOString().slice(0, 10),
    status: visit.status,
    validFrom: visit.validFrom,
    validUntil: visit.validUntil,
  };
}
