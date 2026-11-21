import { Injectable } from '@nestjs/common';
import { AreasUsageService } from './areas-usage.service.js';
import { DelinquencyService } from './delinquency.service.js';
import type { AdminSummaryDto } from './dto/summary-response.dto.js';
import { IncidentsReportService } from './incidents-report.service.js';
import { ParticipationReportService } from './participation-report.service.js';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Resumen "de un vistazo" para la administración (H37). Cada cifra sale del
 * mismo servicio de cálculo que su reporte, con el periodo de su tarjeta:
 *
 * - Morosidad (H32): monto adeudado y porcentaje de unidades morosas de los
 *   últimos 12 meses (el periodo por defecto del panel).
 * - Áreas comunes (H33): mes actual (el periodo por defecto del reporte).
 *   Ocupación promedio = promedio simple de la ocupación de las áreas
 *   habilitadas; área más usada con los desempates de H33.
 * - Incidencias (H34): todas las abiertas de hoy y, de ellas, las que llevan
 *   más de 7 días.
 * - Votaciones (H35): participación promedio de la última asamblea Cerrada.
 *
 * Las cuatro se calculan en paralelo y viajan en una sola respuesta.
 */
@Injectable()
export class SummaryService {
  constructor(
    private readonly delinquency: DelinquencyService,
    private readonly areas: AreasUsageService,
    private readonly incidents: IncidentsReportService,
    private readonly participation: ParticipationReportService,
  ) {}

  async getSummary(now = new Date()): Promise<AdminSummaryDto> {
    const [debt, areas, incidents, lastClosed] = await Promise.all([
      // Solo se usan las cifras resumen: la tabla se pide de una fila.
      this.delinquency.getReport({ page: 1, pageSize: 1 }, now),
      this.areas.getReport({}, now),
      this.incidents.openSummary(now),
      this.participation.lastClosed(),
    ]);

    const occupancies = areas.data.map((area) => area.occupancyPct);

    return {
      debt: {
        owedAmount: debt.summary.owedAmount,
        overduePct: debt.summary.overduePct,
      },
      areas: {
        avgOccupancyPct:
          occupancies.length > 0
            ? round1(
                occupancies.reduce((sum, pct) => sum + pct, 0) /
                  occupancies.length,
              )
            : null,
        mostUsed: areas.mostUsed,
      },
      incidents,
      voting: lastClosed
        ? {
            assemblyTitle: lastClosed.title,
            avgParticipationPct: lastClosed.avgParticipationPct,
          }
        : null,
      generatedAt: now,
    };
  }
}
