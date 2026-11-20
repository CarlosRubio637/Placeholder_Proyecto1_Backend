import { Injectable } from '@nestjs/common';
import { toDbDate } from '@Common/time';
import { PrismaService } from '@Prisma/services';
import { ReservationStatus } from '@PrismaClient';

/** Periodo en fechas de calendario, ambos extremos incluidos ("AAAA-MM-DD"). */
export type DateRange = { from: string; to: string };

export type ActiveArea = {
  id: string;
  name: string;
  openTime: string;
  closeTime: string;
};

export type ReservationRow = {
  areaId: string;
  status: ReservationStatus;
  startTime: string;
  endTime: string;
};

export type BlockRow = { areaId: string; startDate: Date; endDate: Date };

/**
 * Consultas del reporte de uso de áreas comunes (H33). Lee CommonArea y
 * AreaBlock (H9) y Reservation (H7), así las cifras coinciden con el Módulo 2.
 */
@Injectable()
export class AreasUsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Áreas habilitadas; las deshabilitadas no entran al reporte. */
  activeAreas(): Promise<ActiveArea[]> {
    return this.prisma.commonArea.findMany({
      where: { isActive: true },
      select: { id: true, name: true, openTime: true, closeTime: true },
    });
  }

  /** Reservas de las áreas dadas cuya fecha está en el periodo, en cualquier estado. */
  reservations(areaIds: string[], range: DateRange): Promise<ReservationRow[]> {
    return this.prisma.reservation.findMany({
      where: {
        areaId: { in: areaIds },
        date: { gte: toDbDate(range.from), lte: toDbDate(range.to) },
      },
      select: { areaId: true, status: true, startTime: true, endTime: true },
    });
  }

  /** Bloqueos de las áreas dadas que tocan al menos un día del periodo. */
  blocks(areaIds: string[], range: DateRange): Promise<BlockRow[]> {
    return this.prisma.areaBlock.findMany({
      where: {
        areaId: { in: areaIds },
        startDate: { lte: toDbDate(range.to) },
        endDate: { gte: toDbDate(range.from) },
      },
      select: { areaId: true, startDate: true, endDate: true },
    });
  }
}
