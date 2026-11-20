import { Injectable } from '@nestjs/common';
import { addDays, daysInRange, fromDbDate, todayIso } from '@Common/time';
import { badRequest } from '@Common/validation';
import { ReservationStatus } from '@PrismaClient';
import {
  AREAS_USAGE_MAX_RANGE_DAYS,
  AREAS_USAGE_MESSAGES,
} from './areas-usage.constants.js';
import {
  AreasUsageRepository,
  type BlockRow,
  type DateRange,
} from './areas-usage.repository.js';
import type { AreasUsageQueryDto } from './dto/areas-usage-query.dto.js';
import type {
  AreaRefDto,
  AreaUsageDto,
  AreasUsageReportDto,
} from './dto/areas-usage-response.dto.js';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "HH:mm" → minutos desde la medianoche. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Días del periodo ("AAAA-MM-DD") que caen dentro de algún bloqueo del área. */
function blockedDays(blocks: BlockRow[], range: DateRange): Set<string> {
  const days = new Set<string>();
  for (const block of blocks) {
    const start = fromDbDate(block.startDate);
    const end = fromDbDate(block.endDate);
    let day = start > range.from ? start : range.from;
    const last = end < range.to ? end : range.to;
    while (day <= last) {
      days.add(day);
      day = addDays(day, 1);
    }
  }
  return days;
}

const byName = (a: AreaUsageDto, b: AreaUsageDto) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });

/** Más usada primero: mayor ocupación, luego más reservas, luego nombre. */
const mostUsedFirst = (a: AreaUsageDto, b: AreaUsageDto) =>
  b.occupancyPct - a.occupancyPct || b.confirmed - a.confirmed || byName(a, b);

/** Menos usada primero: menor ocupación, luego menos reservas, luego nombre. */
const leastUsedFirst = (a: AreaUsageDto, b: AreaUsageDto) =>
  a.occupancyPct - b.occupancyPct || a.confirmed - b.confirmed || byName(a, b);

const toRef = (area: AreaUsageDto): AreaRefDto => ({
  areaId: area.areaId,
  name: area.name,
});

/**
 * Reporte de uso de áreas comunes (H33).
 *
 * - Horas reservadas: duración de las reservas Confirmadas con fecha en el
 *   periodo. Las canceladas (residente o administración) no cuentan.
 * - Horas habilitadas: por cada día del periodo sin bloqueo, las horas entre
 *   la apertura y el cierre del área. CommonArea guarda solo el horario
 *   actual (H9 no lleva historial), así que ese es el horario vigente.
 * - Ocupación: reservadas / habilitadas × 100, un decimal; 0 sin horas.
 * - Más y menos usada: con los desempates de la historia. null si no hay
 *   ninguna reserva Confirmada en el periodo (estado vacío).
 * - Las áreas deshabilitadas no entran.
 */
@Injectable()
export class AreasUsageService {
  constructor(private readonly repository: AreasUsageRepository) {}

  /** Periodo pedido o el de por defecto: el mes actual, del día 1 hasta hoy. */
  resolvePeriod(
    query: Pick<AreasUsageQueryDto, 'from' | 'to'>,
    today: string,
  ): DateRange {
    const to = query.to ?? today;
    const from = query.from ?? `${to.slice(0, 8)}01`;
    if (to < from) {
      throw badRequest('to', AREAS_USAGE_MESSAGES.endBeforeStart);
    }
    // Misma regla que H32 y H34: la diferencia entre las fechas no pasa de 366.
    if (daysInRange(from, to) - 1 > AREAS_USAGE_MAX_RANGE_DAYS) {
      throw badRequest('to', AREAS_USAGE_MESSAGES.rangeTooLong);
    }
    return { from, to };
  }

  async getReport(
    query: AreasUsageQueryDto,
    now = new Date(),
  ): Promise<AreasUsageReportDto> {
    const range = this.resolvePeriod(query, todayIso(now));
    const areas = await this.repository.activeAreas();
    if (areas.length === 0) {
      return { data: [], mostUsed: null, leastUsed: null };
    }

    const ids = areas.map((area) => area.id);
    const [reservations, blocks] = await Promise.all([
      this.repository.reservations(ids, range),
      this.repository.blocks(ids, range),
    ]);
    const periodDays = daysInRange(range.from, range.to);

    const data: AreaUsageDto[] = areas.map((area) => {
      const own = reservations.filter((r) => r.areaId === area.id);
      const confirmed = own.filter(
        (r) => r.status === ReservationStatus.CONFIRMADA,
      );
      const reservedMinutes = confirmed.reduce(
        (sum, r) => sum + toMinutes(r.endTime) - toMinutes(r.startTime),
        0,
      );

      const openDays =
        periodDays -
        blockedDays(
          blocks.filter((b) => b.areaId === area.id),
          range,
        ).size;
      const dailyMinutes = toMinutes(area.closeTime) - toMinutes(area.openTime);
      const enabledMinutes = openDays * dailyMinutes;

      return {
        areaId: area.id,
        name: area.name,
        confirmed: confirmed.length,
        cancelled: own.length - confirmed.length,
        reservedHours: round1(reservedMinutes / 60),
        enabledHours: round1(enabledMinutes / 60),
        occupancyPct:
          enabledMinutes > 0
            ? round1((reservedMinutes / enabledMinutes) * 100)
            : 0,
      };
    });

    data.sort(mostUsedFirst);
    const hasReservations = data.some((area) => area.confirmed > 0);

    return {
      data,
      mostUsed: hasReservations ? toRef(data[0]) : null,
      leastUsed: hasReservations
        ? toRef([...data].sort(leastUsedFirst)[0])
        : null,
    };
  }
}
