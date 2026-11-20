import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { fromDbDate, todayIso, toDbDate } from '@Common/time';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { PrismaService } from '@Prisma/services';
import { Prisma, Role, VisitStatus, type User } from '@PrismaClient';
import type {
  MyVisitListDto,
  MyVisitsQueryDto,
  VisitAnsweredDto,
  VisitCancelledDto,
  VisitResponseDto,
} from './dto/index.js';
import {
  MY_VISITS_MESSAGES as M,
  NO_RESPONSE_REASON,
  REQUEST_RESPONSE_MINUTES,
  VISIT_MESSAGES,
} from './visits.constants.js';

const RESPONSE_MS = REQUEST_RESPONSE_MINUTES * 60 * 1000;

const HISTORY_STATUSES = [
  VisitStatus.RECHAZADA,
  VisitStatus.DENTRO,
  VisitStatus.FINALIZADA,
  VisitStatus.CANCELADA,
  VisitStatus.VENCIDA,
];

const ROW_SELECT = {
  id: true,
  visitorName: true,
  documentType: true,
  documentNumber: true,
  visitDate: true,
  expectedTime: true,
  entryAt: true,
  reason: true,
  code: true,
  status: true,
  origin: true,
  rejectReason: true,
  createdAt: true,
  createdBy: {
    select: { role: true, profile: { select: { fullName: true } } },
  },
} satisfies Prisma.VisitSelect;

/**
 * "Mis visitas" (H15): las visitas pertenecen a la unidad, así que cualquier
 * residente de la unidad las ve, cancela y responde.
 */
@Injectable()
export class ResidentVisitsService {
  private readonly logger = new Logger(ResidentVisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    resident: User,
    query: MyVisitsQueryDto,
    now = new Date(),
  ): Promise<MyVisitListDto> {
    const unitId = this.requireUnit(resident);
    const active = query.tab === 'activas';

    // Activas: Pendiente de autorización (primero) y Autorizada de hoy en
    // adelante. El enum se ordena por declaración (AUTORIZADA, PENDIENTE…),
    // así que `status desc` deja las pendientes arriba.
    const where: Prisma.VisitWhereInput = active
      ? {
          unitId,
          OR: [
            { status: VisitStatus.PENDIENTE_AUTORIZACION },
            {
              status: VisitStatus.AUTORIZADA,
              visitDate: { gte: toDbDate(todayIso(now)) },
            },
          ],
        }
      : { unitId, status: { in: HISTORY_STATUSES } };
    const orderBy: Prisma.VisitOrderByWithRelationInput[] = active
      ? [
          { status: 'desc' },
          { visitDate: 'asc' },
          { expectedTime: 'asc' },
          { createdAt: 'asc' },
        ]
      : [{ visitDate: 'desc' }, { createdAt: 'desc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: ROW_SELECT,
      }),
      this.prisma.visit.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        visitorName: row.visitorName,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        visitDate: fromDbDate(row.visitDate),
        expectedTime: row.expectedTime,
        entryAt: row.entryAt,
        reason: row.reason,
        code: row.code,
        status: row.status,
        origin: row.origin,
        createdBy:
          row.createdBy.role === Role.RESIDENTE
            ? (row.createdBy.profile?.fullName ?? 'Residente')
            : 'Seguridad',
        rejectReason: row.rejectReason,
        expiresAt:
          row.status === VisitStatus.PENDIENTE_AUTORIZACION
            ? new Date(row.createdAt.getTime() + RESPONSE_MS)
            : null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Autorizada → Cancelada con fecha, hora y autor (H15). */
  async cancel(
    resident: User,
    visitId: string,
    now = new Date(),
  ): Promise<VisitCancelledDto> {
    const unitId = this.requireUnit(resident);
    const { count } = await this.prisma.visit.updateMany({
      where: { id: visitId, unitId, status: VisitStatus.AUTORIZADA },
      data: {
        status: VisitStatus.CANCELADA,
        cancelledAt: now,
        cancelledById: resident.id,
      },
    });
    if (count === 0) {
      await this.findOwnOrThrow(visitId, unitId);
      throw new ConflictException(M.notAuthorized);
    }
    return { id: visitId, status: VisitStatus.CANCELADA, cancelledAt: now };
  }

  /**
   * Aprobar o rechazar una solicitud de portería (H15). La actualización va
   * condicionada por el estado Pendiente y por los 15 minutos: si dos
   * residentes responden a la vez, solo se aplica la primera.
   */
  async respond(
    resident: User,
    visitId: string,
    dto: VisitResponseDto,
    now = new Date(),
  ): Promise<VisitAnsweredDto> {
    const unitId = this.requireUnit(resident);
    const approve = dto.decision === 'APROBAR';
    const status = approve ? VisitStatus.AUTORIZADA : VisitStatus.RECHAZADA;

    const { count } = await this.prisma.visit.updateMany({
      where: {
        id: visitId,
        unitId,
        status: VisitStatus.PENDIENTE_AUTORIZACION,
        createdAt: { gt: new Date(now.getTime() - RESPONSE_MS) },
      },
      data: {
        status,
        respondedById: resident.id,
        respondedAt: now,
        rejectReason: approve ? null : (dto.reason ?? null),
      },
    });
    if (count === 0) {
      throw await this.whyNotPending(visitId, unitId, now);
    }

    await this.notifySecurity(visitId, resident, approve, dto.reason);
    return { id: visitId, status, respondedAt: now };
  }

  /** El 409 que corresponde cuando la solicitud ya no se puede responder. */
  private async whyNotPending(
    visitId: string,
    unitId: string,
    now: Date,
  ): Promise<Error> {
    const visit = await this.findOwnOrThrow(visitId, unitId);
    if (visit.respondedById) return new ConflictException(M.alreadyAnswered);
    const expired =
      (visit.status === VisitStatus.PENDIENTE_AUTORIZACION &&
        visit.createdAt.getTime() + RESPONSE_MS <= now.getTime()) ||
      (visit.status === VisitStatus.RECHAZADA &&
        visit.rejectReason === NO_RESPONSE_REASON);
    return new ConflictException(expired ? M.expired : M.notPending);
  }

  /** La visita de la unidad, o 404 (no revela visitas de otra unidad). */
  private async findOwnOrThrow(visitId: string, unitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, unitId },
      select: {
        status: true,
        createdAt: true,
        respondedById: true,
        rejectReason: true,
      },
    });
    if (!visit) throw new NotFoundException(M.notFound);
    return visit;
  }

  /**
   * Avisa a todo el Personal de seguridad activo (H30). Va después de
   * guardar: si el aviso falla, la respuesta ya quedó.
   */
  private async notifySecurity(
    visitId: string,
    resident: User,
    approved: boolean,
    reason: string | undefined,
  ): Promise<void> {
    try {
      const [visit, profile, guards] = await Promise.all([
        this.prisma.visit.findUniqueOrThrow({
          where: { id: visitId },
          select: { visitorName: true, unit: { select: { code: true } } },
        }),
        this.prisma.profile.findUnique({
          where: { userId: resident.id },
          select: { fullName: true },
        }),
        this.prisma.user.findMany({
          where: { role: Role.SEGURIDAD, isActive: true },
          select: { id: true },
        }),
      ]);
      if (guards.length === 0) return;

      const name = profile?.fullName ?? 'Un residente';
      await this.notifications.send({
        recipient: {
          type: RecipientType.USUARIO,
          ids: guards.map((g) => g.id),
        },
        title: `Solicitud ${approved ? 'aprobada' : 'rechazada'}: ${visit.unit.code}`,
        message: approved
          ? `${name} aprobó el ingreso de ${visit.visitorName}. Ya puedes registrar su entrada.`
          : `${name} rechazó el ingreso de ${visit.visitorName}. Motivo: ${reason ?? M.noReason}.`,
        sourceModule: SourceModule.VISITAS,
        reference: { type: 'visit', id: visitId },
      });
    } catch (error) {
      this.logger.error(
        `Visita ${visitId} respondida, pero falló el aviso a seguridad`,
        error as Error,
      );
    }
  }

  private requireUnit(resident: User): string {
    if (!resident.unitId) throw new ForbiddenException(VISIT_MESSAGES.noUnit);
    return resident.unitId;
  }
}
