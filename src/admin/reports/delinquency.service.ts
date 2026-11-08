import { Injectable } from '@nestjs/common';
import { todayIso, toDbDate } from '@Common/time';
import { badRequest } from '@Common/validation';
import {
  DelinquencyRepository,
  type DueDateRange,
} from './delinquency.repository.js';
import type { DelinquencyQueryDto } from './dto/delinquency-query.dto.js';
import type {
  DelinquencyReportDto,
  DelinquentUnitDto,
} from './dto/delinquency-response.dto.js';
import {
  DELINQUENCY_MAX_RANGE_DAYS,
  DELINQUENCY_MESSAGES,
} from './reports.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días entre dos fechas "AAAA-MM-DD" (to − from). */
function daysBetween(from: string, to: string): number {
  return Math.round(
    (toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS,
  );
}

/** La misma fecha 12 meses antes; el 29 de febrero pasa al 28. */
export function twelveMonthsBefore(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  const previousYear = String(Number(year) - 1).padStart(4, '0');
  const safeDay = month === '02' && day === '29' ? '28' : day;
  return `${previousYear}-${month}-${safeDay}`;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Panel de morosidad (H32).
 *
 * - Monto adeudado: cuotas Pendiente y Moroso con vencimiento en el rango.
 * - Unidad morosa: al menos una cuota Moroso en el rango.
 * - Porcentaje: unidades morosas / unidades activas × 100, un decimal.
 * - Antigüedad: días completos desde el vencimiento de la cuota impaga más
 *   antigua del rango hasta hoy (fecha del condominio). Nunca negativa.
 */
@Injectable()
export class DelinquencyService {
  constructor(private readonly repository: DelinquencyRepository) {}

  /** Rango pedido o el de por defecto: últimos 12 meses hasta hoy. */
  resolveRange(
    query: Pick<DelinquencyQueryDto, 'from' | 'to'>,
    today: string,
  ): DueDateRange {
    const to = query.to ?? today;
    const from = query.from ?? twelveMonthsBefore(to);
    if (to < from) {
      throw badRequest('to', DELINQUENCY_MESSAGES.endBeforeStart);
    }
    if (daysBetween(from, to) > DELINQUENCY_MAX_RANGE_DAYS) {
      throw badRequest('to', DELINQUENCY_MESSAGES.rangeTooLong);
    }
    return { from, to };
  }

  async getReport(
    query: DelinquencyQueryDto,
    now = new Date(),
  ): Promise<DelinquencyReportDto> {
    const today = todayIso(now);
    const range = this.resolveRange(query, today);

    const [owedAmount, overdueUnitIds, activeUnits] = await Promise.all([
      this.repository.owedAmount(range),
      this.repository.overdueUnitIds(range),
      this.repository.countActiveUnits(),
    ]);
    const debts = await this.repository.unitDebts(overdueUnitIds, range);

    const todayDate = toDbDate(today).getTime();
    const rows: DelinquentUnitDto[] = debts
      .map((debt) => ({
        unitCode: debt.unitCode,
        owedAmount: round(debt.owedAmount, 2),
        ageDays: Math.max(
          0,
          Math.round((todayDate - debt.oldestDueDate.getTime()) / DAY_MS),
        ),
      }))
      // Antigüedad descendente; en empate, código de unidad ascendente.
      .sort(
        (a, b) =>
          b.ageDays - a.ageDays ||
          (a.unitCode < b.unitCode ? -1 : a.unitCode > b.unitCode ? 1 : 0),
      );

    // El orden se aplica en memoria porque groupBy no ordena por unit.code;
    // son a lo sumo las unidades del condominio (48).
    const { page, pageSize } = query;
    const start = (page - 1) * pageSize;

    return {
      summary: {
        owedAmount: round(owedAmount, 2),
        overdueUnits: overdueUnitIds.length,
        activeUnits,
        overduePct:
          activeUnits > 0
            ? round((overdueUnitIds.length / activeUnits) * 100, 1)
            : 0,
      },
      data: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }
}
