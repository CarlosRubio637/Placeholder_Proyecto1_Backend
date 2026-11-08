import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  IncidentStatus,
  type IncidentPriority,
  type Prisma,
} from '@PrismaClient';

/** Periodo como instantes: desde `gte` (incluido) hasta `lt` (excluido). */
export type InstantRange = { gte: Date; lt: Date };

export type StatusPriorityCount = {
  status: IncidentStatus;
  priority: IncidentPriority;
  count: number;
};

export type ResolutionTimes = { createdAt: Date; resolvedAt: Date };

/** Estados abiertos del Módulo 3. */
export const OPEN_STATUSES: IncidentStatus[] = [
  IncidentStatus.PENDIENTE,
  IncidentStatus.EN_PROCESO,
];

const STALE_SELECT = {
  number: true,
  title: true,
  status: true,
  priority: true,
  createdAt: true,
  unit: { select: { code: true } },
  assignee: { select: { name: true } },
} satisfies Prisma.IncidentSelect;

export type StaleIncidentRow = Prisma.IncidentGetPayload<{
  select: typeof STALE_SELECT;
}>;

/**
 * Consultas del reporte de incidencias abiertas (H34). Lee Incident (H10) y
 * MaintenanceStaff (H12), así las cifras coinciden con el Módulo 3.
 */
@Injectable()
export class IncidentsReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Incidencias creadas en el periodo, agrupadas por su estado y prioridad actuales. */
  async countByStatusAndPriority(
    created: InstantRange,
  ): Promise<StatusPriorityCount[]> {
    const groups = await this.prisma.incident.groupBy({
      by: ['status', 'priority'],
      where: { createdAt: created },
      _count: { _all: true },
    });
    return groups.map((group) => ({
      status: group.status,
      priority: group.priority,
      count: group._count._all,
    }));
  }

  /**
   * Fechas de las incidencias Resuelto cuyo resolvedAt está en el periodo. Al
   * reabrir, H13 borra resolvedAt, así que el valor guardado es siempre el de
   * la última resolución.
   */
  resolutionTimes(resolved: InstantRange): Promise<ResolutionTimes[]> {
    return this.prisma.incident.findMany({
      where: { status: IncidentStatus.RESUELTO, resolvedAt: resolved },
      select: { createdAt: true, resolvedAt: true },
    }) as Promise<ResolutionTimes[]>;
  }

  /**
   * Abiertas hoy creadas antes de `createdBefore`, de la más antigua a la más
   * reciente (el número desempata). No aplica el periodo del reporte.
   */
  async staleOpen(
    createdBefore: Date,
    page: number,
    pageSize: number,
  ): Promise<{ rows: StaleIncidentRow[]; total: number }> {
    const where = {
      status: { in: OPEN_STATUSES },
      createdAt: { lt: createdBefore },
    } satisfies Prisma.IncidentWhereInput;

    const [rows, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        select: STALE_SELECT,
        orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.incident.count({ where }),
    ]);
    return { rows, total };
  }
}
