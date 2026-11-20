import { Injectable } from '@nestjs/common';
import {
  addDays,
  condominiumDayStart,
  daysInRange,
  todayIso,
} from '@Common/time';
import { badRequest } from '@Common/validation';
import type { ParticipationReportQueryDto } from './dto/participation-report-query.dto.js';
import type {
  AssemblyParticipationDto,
  ParticipationReportDto,
} from './dto/participation-report-response.dto.js';
import {
  PARTICIPATION_DEFAULT_MONTHS,
  PARTICIPATION_MAX_RANGE_DAYS,
  PARTICIPATION_MESSAGES,
} from './participation-report.constants.js';
import {
  ParticipationReportRepository,
  type AssemblyFilter,
  type AssemblyRow,
} from './participation-report.repository.js';

/** Periodo en fechas de calendario, ambos extremos incluidos. */
export type ReportPeriod = { from: string; to: string };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Porcentaje sin redondear; 0 si el total es 0. */
function ratioPct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/**
 * La misma fecha `months` meses antes ("AAAA-MM-DD"). Si ese día no existe en
 * el mes de destino (31 de marzo − 1 mes), usa el último día de ese mes.
 */
export function monthsBefore(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Reporte de participación en votaciones (H35).
 *
 * - Entran las asambleas Abiertas y Cerradas; las Programadas no tienen datos.
 * - Filtro: una asamblea (`assemblyId`, sin fechas) o las abiertas en el
 *   periodo (por defecto, de hoy − 12 meses a hoy). La apertura más reciente
 *   primero, 10 por página.
 * - Unidades habilitadas: las guardadas al abrir la asamblea (H22). Unidades
 *   que votaron: los registros de participación del tema (H23).
 * - Participación: votaron / habilitadas × 100, un decimal. Promedio por
 *   asamblea: promedio simple de sus temas (redondeado al final).
 * - Nunca se lee qué opción eligió cada unidad: el voto es secreto.
 */
@Injectable()
export class ParticipationReportService {
  constructor(private readonly repository: ParticipationReportRepository) {}

  /** Periodo pedido o el de por defecto: de hoy − 12 meses a hoy. */
  resolvePeriod(
    query: Pick<ParticipationReportQueryDto, 'from' | 'to'>,
    today: string,
  ): ReportPeriod {
    const to = query.to ?? today;
    const from = query.from ?? monthsBefore(to, PARTICIPATION_DEFAULT_MONTHS);
    if (to < from) {
      throw badRequest('to', PARTICIPATION_MESSAGES.endBeforeStart);
    }
    // Misma regla que H32 a H34: la diferencia entre las fechas no pasa de 366.
    if (daysInRange(from, to) - 1 > PARTICIPATION_MAX_RANGE_DAYS) {
      throw badRequest('to', PARTICIPATION_MESSAGES.rangeTooLong);
    }
    return { from, to };
  }

  async getReport(
    query: ParticipationReportQueryDto,
    now = new Date(),
  ): Promise<ParticipationReportDto> {
    const period = this.resolvePeriod(query, todayIso(now));
    const filter: AssemblyFilter = query.assemblyId
      ? { assemblyId: query.assemblyId }
      : {
          openedAt: {
            gte: condominiumDayStart(period.from),
            lt: condominiumDayStart(addDays(period.to, 1)),
          },
        };
    const { page, pageSize } = query;

    const { rows, total } = await this.repository.assemblies(
      filter,
      page,
      pageSize,
    );
    return { data: rows.map(toAssemblyParticipation), total, page, pageSize };
  }
}

function toAssemblyParticipation(row: AssemblyRow): AssemblyParticipationDto {
  const eligibleUnits = row._count.eligibleUnits;
  const raw = row.topics.map((topic) =>
    ratioPct(topic._count.voteParticipations, eligibleUnits),
  );
  const average =
    raw.length > 0 ? raw.reduce((sum, pct) => sum + pct, 0) / raw.length : 0;

  return {
    assemblyId: row.id,
    title: row.title,
    status: row.status,
    // Abiertas y Cerradas siempre tienen apertura (H22).
    openedAt: row.openedAt as Date,
    avgParticipationPct: round1(average),
    topics: row.topics.map((topic, index) => ({
      question: topic.question,
      votedUnits: topic._count.voteParticipations,
      eligibleUnits,
      participationPct: round1(raw[index]),
    })),
  };
}
