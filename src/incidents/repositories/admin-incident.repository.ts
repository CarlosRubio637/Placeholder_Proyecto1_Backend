import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  IncidentEventType,
  IncidentStatus,
  type IncidentLocation,
  type IncidentPriority,
  type Prisma,
} from '@PrismaClient';

export interface AdminListParams {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  location?: IncidentLocation;
  /** uuid, o "none" para las que no tienen responsable. */
  assigneeId?: string;
  /** Ya normalizada como searchKey (minúsculas y sin tildes). */
  search?: string;
  page: number;
  pageSize: number;
}

const ADMIN_LIST_SELECT = {
  id: true,
  number: true,
  title: true,
  location: true,
  status: true,
  priority: true,
  createdAt: true,
  unit: { select: { code: true } },
  assignee: { select: { id: true, name: true } },
} satisfies Prisma.IncidentSelect;

export type AdminIncidentRow = Prisma.IncidentGetPayload<{
  select: typeof ADMIN_LIST_SELECT;
}>;

export interface ManagementChange {
  incidentId: string;
  actorId: string;
  priority?: IncidentPriority;
  /** undefined: no cambia; null: quita el responsable. */
  assignee?: { id: string; name: string } | null;
}

/** Errores de dominio que el servicio traduce a HTTP. */
export class IncidentNotFoundError extends Error {}
export class IncidentResolvedError extends Error {}
/** H13: la transición no está en la tabla de estados. */
export class TransitionNotAllowedError extends Error {}
/** H13: no se puede iniciar la atención sin responsable. */
export class AssigneeRequiredError extends Error {}
/** H13: el estado ya no es el que vio el administrador. */
export class StatusChangedError extends Error {}

/** Tabla de estados de H13: desde → hacia. */
export const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  PENDIENTE: [IncidentStatus.EN_PROCESO],
  EN_PROCESO: [IncidentStatus.RESUELTO],
  RESUELTO: [IncidentStatus.EN_PROCESO],
};

export interface StatusChange {
  incidentId: string;
  actorId: string;
  expectedStatus: IncidentStatus;
  toStatus: IncidentStatus;
  note: string;
  now: Date;
}

/** Consultas y cambios de la bandeja del administrador (H12). */
@Injectable()
export class AdminIncidentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bandeja: prioridad Alta → Media → Baja (el enum de Postgres se ordena
   * por declaración: BAJA, MEDIA, ALTA) y, dentro de cada una, la más antigua.
   */
  async list(
    params: AdminListParams,
  ): Promise<{ data: AdminIncidentRow[]; total: number }> {
    const where: Prisma.IncidentWhereInput = {
      status: params.status,
      priority: params.priority,
      location: params.location,
      ...(params.assigneeId === 'none'
        ? { assigneeId: null }
        : params.assigneeId
          ? { assigneeId: params.assigneeId }
          : {}),
      ...(params.search ? { searchKey: { contains: params.search } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.incident.findMany({
        where,
        select: ADMIN_LIST_SELECT,
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
          { number: 'asc' },
        ],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.incident.count({ where }),
    ]);
    return { data, total };
  }

  activeStaff() {
    return this.prisma.maintenanceStaff.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, specialty: true, phone: true },
    });
  }

  findActiveStaff(id: string) {
    return this.prisma.maintenanceStaff.findFirst({
      where: { id, isActive: true },
      select: { id: true, name: true },
    });
  }

  /**
   * Aplica prioridad y responsable con un evento por cada valor que cambia,
   * en una transacción. La fila queda bloqueada (FOR UPDATE) para que el valor
   * anterior del evento sea el real y para que H13 no la resuelva a la mitad.
   */
  applyManagement(change: ManagementChange) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM incidents WHERE id = ${change.incidentId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new IncidentNotFoundError();

      const current = await tx.incident.findUniqueOrThrow({
        where: { id: change.incidentId },
        select: {
          status: true,
          priority: true,
          assignee: { select: { id: true, name: true } },
        },
      });
      if (current.status === IncidentStatus.RESUELTO) {
        throw new IncidentResolvedError();
      }

      const events: Prisma.IncidentEventCreateManyInput[] = [];
      const data: Prisma.IncidentUncheckedUpdateInput = {};

      if (change.priority && change.priority !== current.priority) {
        data.priority = change.priority;
        events.push({
          incidentId: change.incidentId,
          type: IncidentEventType.PRIORIDAD,
          fromValue: current.priority,
          toValue: change.priority,
          authorId: change.actorId,
        });
      }
      if (
        change.assignee !== undefined &&
        (change.assignee?.id ?? null) !== (current.assignee?.id ?? null)
      ) {
        data.assigneeId = change.assignee?.id ?? null;
        events.push({
          incidentId: change.incidentId,
          type: IncidentEventType.ASIGNACION,
          fromValue: current.assignee?.name ?? null,
          toValue: change.assignee?.name ?? null,
          authorId: change.actorId,
        });
      }

      if (events.length > 0) {
        await tx.incident.update({ where: { id: change.incidentId }, data });
        // Uno por uno: así cada evento tiene su propio createdAt en orden.
        for (const event of events) {
          await tx.incidentEvent.create({ data: event });
        }
      }

      const incident = await tx.incident.findUniqueOrThrow({
        where: { id: change.incidentId },
        select: {
          id: true,
          number: true,
          status: true,
          priority: true,
          assignee: { select: { id: true, name: true } },
        },
      });
      const event =
        events.length === 0
          ? null
          : await tx.incidentEvent.findFirst({
              where: { incidentId: change.incidentId },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select: {
                id: true,
                type: true,
                fromValue: true,
                toValue: true,
                createdAt: true,
              },
            });
      return { incident, event };
    });
  }

  /**
   * Cambia el estado (H13) y guarda su evento en una transacción. La
   * actualización va condicionada por `status = expectedStatus`: si otro
   * administrador lo cambió antes, no afecta filas y responde que cambió.
   */
  applyStatusChange(change: StatusChange) {
    return this.prisma.$transaction(async (tx) => {
      // Mismo candado que H12: nadie quita el responsable entre la revisión
      // y el cambio a En proceso.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM incidents WHERE id = ${change.incidentId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new IncidentNotFoundError();

      const current = await tx.incident.findUnique({
        where: { id: change.incidentId },
        select: {
          number: true,
          title: true,
          reporterId: true,
          assigneeId: true,
          status: true,
        },
      });
      if (!current) throw new IncidentNotFoundError();
      if (
        !ALLOWED_TRANSITIONS[change.expectedStatus].includes(change.toStatus)
      ) {
        throw new TransitionNotAllowedError();
      }
      if (current.status !== change.expectedStatus) {
        throw new StatusChangedError();
      }
      if (
        change.toStatus === IncidentStatus.EN_PROCESO &&
        !current.assigneeId
      ) {
        throw new AssigneeRequiredError();
      }

      const { count } = await tx.incident.updateMany({
        where: { id: change.incidentId, status: change.expectedStatus },
        data: {
          status: change.toStatus,
          // Resuelto guarda el momento; reabrir lo borra.
          resolvedAt:
            change.toStatus === IncidentStatus.RESUELTO ? change.now : null,
        },
      });
      if (count === 0) throw new StatusChangedError();

      const event = await tx.incidentEvent.create({
        data: {
          incidentId: change.incidentId,
          type: IncidentEventType.ESTADO,
          fromStatus: change.expectedStatus,
          toStatus: change.toStatus,
          note: change.note,
          authorId: change.actorId,
          createdAt: change.now,
        },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          createdAt: true,
        },
      });

      return {
        incident: {
          id: change.incidentId,
          status: change.toStatus,
          resolvedAt:
            change.toStatus === IncidentStatus.RESUELTO ? change.now : null,
        },
        event: {
          id: event.id,
          fromStatus: event.fromStatus ?? change.expectedStatus,
          toStatus: event.toStatus ?? change.toStatus,
          note: event.note ?? change.note,
          createdAt: event.createdAt,
        },
        reporterId: current.reporterId,
        number: current.number,
        title: current.title,
      };
    });
  }
}
