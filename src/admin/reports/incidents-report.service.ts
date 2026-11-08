import { Injectable } from '@nestjs/common';
import {
  addDays,
  condominiumDayStart,
  daysInRange,
  todayIso,
} from '@Common/time';
import { badRequest } from '@Common/validation';
import { IncidentPriority, IncidentStatus } from '@PrismaClient';
import type { IncidentsReportQueryDto } from './dto/incidents-report-query.dto.js';
import type {
  IncidentMatrixCellDto,
  IncidentsReportDto,
} from './dto/incidents-report-response.dto.js';
import {
  INCIDENTS_REPORT_MAX_RANGE_DAYS,
  INCIDENTS_REPORT_MESSAGES,
  STALE_AFTER_DAYS,
} from './incidents-report.constants.js';
import {
  IncidentsReportRepository,
  OPEN_STATUSES,
  type InstantRange,
} from './incidents-report.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Orden de las filas y columnas de la tabla cruzada. */
const STATUSES = [
  IncidentStatus.PENDIENTE,
  IncidentStatus.EN_PROCESO,
  IncidentStatus.RESUELTO,
];
const PRIORITIES = [
  IncidentPriority.ALTA,
  IncidentPriority.MEDIA,
  IncidentPriority.BAJA,
];

/** Periodo del reporte en fechas de calendario, ambos extremos incluidos. */
export type ReportPeriod = { from: string; to: string };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** El periodo como instantes: del inicio de `from` al inicio del día siguiente a `to`. */
export function periodInstants(period: ReportPeriod): InstantRange {
  return {
    gte: condominiumDayStart(period.from),
    lt: condominiumDayStart(addDays(period.to, 1)),
  };
}

/**
 * Reporte de incidencias abiertas (H34).
 *
 * - Tabla cruzada: incidencias creadas en el periodo, por su estado y su
 *   prioridad actuales. Siempre trae las 9 celdas.
 * - Total de abiertas: las de la tabla en Pendiente o En proceso.
 * - Tiempo promedio de resolución: (resolvedAt − createdAt) en días, un
 *   decimal, de las Resuelto con resolvedAt en el periodo; null si no hay.
 * - Abiertas con más de 7 días: todas las abiertas de hoy, sin el periodo,
 *   con más de 7 días de calendario del condominio desde su creación.
 */
@Injectable()
export class IncidentsReportService {
  constructor(private readonly repository: IncidentsReportRepository) {}

  /** Periodo pedido o el de por defecto: el mes actual, del día 1 hasta hoy. */
  resolvePeriod(
    query: Pick<IncidentsReportQueryDto, 'from' | 'to'>,
    today: string,
  ): ReportPeriod {
    const to = query.to ?? today;
    const from = query.from ?? `${to.slice(0, 8)}01`;
    if (to < from) {
      throw badRequest('to', INCIDENTS_REPORT_MESSAGES.endBeforeStart);
    }
    // Misma regla que H32: la diferencia entre las fechas no pasa de 366.
    if (daysInRange(from, to) - 1 > INCIDENTS_REPORT_MAX_RANGE_DAYS) {
      throw badRequest('to', INCIDENTS_REPORT_MESSAGES.rangeTooLong);
    }
    return { from, to };
  }

  async getReport(
    query: IncidentsReportQueryDto,
    now = new Date(),
  ): Promise<IncidentsReportDto> {
    const today = todayIso(now);
    const period = periodInstants(this.resolvePeriod(query, today));
    const { page, pageSize } = query;

    // "Más de 7 días": creada a más tardar el día de hoy − 8, en la fecha del
    // condominio. Así daysOpen siempre es 8 o más en la lista.
    const staleBefore = condominiumDayStart(addDays(today, -STALE_AFTER_DAYS));

    const [counts, resolutions, stale] = await Promise.all([
      this.repository.countByStatusAndPriority(period),
      this.repository.resolutionTimes(period),
      this.repository.staleOpen(staleBefore, page, pageSize),
    ]);

    const matrix: IncidentMatrixCellDto[] = STATUSES.flatMap((status) =>
      PRIORITIES.map((priority) => ({
        status,
        priority,
        count:
          counts.find((c) => c.status === status && c.priority === priority)
            ?.count ?? 0,
      })),
    );
    const openTotal = matrix
      .filter((cell) => OPEN_STATUSES.includes(cell.status))
      .reduce((sum, cell) => sum + cell.count, 0);

    const avgResolutionDays =
      resolutions.length > 0
        ? round1(
            resolutions.reduce(
              (sum, r) =>
                sum + (r.resolvedAt.getTime() - r.createdAt.getTime()),
              0,
            ) /
              resolutions.length /
              DAY_MS,
          )
        : null;

    return {
      matrix,
      openTotal,
      avgResolutionDays,
      stale: {
        data: stale.rows.map((row) => ({
          number: row.number,
          title: row.title,
          unitCode: row.unit.code,
          status: row.status,
          priority: row.priority,
          assignee: row.assignee?.name ?? null,
          daysOpen: daysInRange(todayIso(row.createdAt), today) - 1,
        })),
        total: stale.total,
        page,
        pageSize,
      },
    };
  }
}
