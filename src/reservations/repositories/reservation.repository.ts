import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { toDbDate } from '@Common/time';
import { Prisma, ReservationStatus, type CommonArea, type Reservation } from '@PrismaClient';
import {
  AreaBlockedError,
  AreaDisabledError,
  AreaNotFoundError,
  SlotTakenError,
  UnitReservationLimitError,
} from '../errors/index.js';
import {
  MAX_ACTIVE_RESERVATIONS_PER_UNIT,
  reservationCode,
  reservationCodePrefix,
  slotKey,
  type Slot,
} from '../utils/index.js';
import { futureConfirmed, type Clock } from './area.repository.js';

type Tx = Prisma.TransactionClient;

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
/** Reintentos si dos reservas del mismo día toman el mismo consecutivo. */
const CODE_ATTEMPTS = 3;

export interface NewReservation {
  areaId: string;
  unitId: string;
  userId: string;
  /** "AAAA-MM-DD" */
  date: string;
  startTime: string;
  attendees: number;
  clock: Clock;
  /**
   * Valida la solicitud contra el área ya bloqueada (franja y aforo) y
   * devuelve la franja; lanza si es inválida.
   */
  validate: (area: CommonArea) => Slot;
}

/**
 * Acceso a datos de las reservas de los residentes (H7).
 *
 * Crear una reserva bloquea primero la fila de la unidad y luego la del área
 * (`FOR UPDATE`, siempre en ese orden):
 * - la unidad serializa el límite de 2 reservas activas aunque sean de áreas
 *   distintas;
 * - el área serializa con otra reserva de la misma franja y con los cambios
 *   de H9, que también bloquean el área.
 * El índice único de `slotKey` respalda a nivel de base de datos que solo una
 * de dos solicitudes simultáneas quede confirmada.
 */
@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Áreas habilitadas, por nombre (H6 y H7). */
  listActiveAreas(): Promise<CommonArea[]> {
    return this.prisma.commonArea.findMany({
      where: { isActive: true },
      orderBy: { nameKey: 'asc' },
    });
  }

  /** Área habilitada, o null si no existe o está deshabilitada (H6). */
  findActiveArea(id: string): Promise<CommonArea | null> {
    return this.prisma.commonArea.findFirst({ where: { id, isActive: true } });
  }

  /** Bloqueo y reservas confirmadas de un área en una fecha (H6). */
  async findDayOccupancy(
    areaId: string,
    isoDate: string,
  ): Promise<{ blocked: boolean; reservations: Pick<Reservation, 'id' | 'startTime' | 'unitId'>[] }> {
    const date = toDbDate(isoDate);
    const [block, reservations] = await Promise.all([
      this.prisma.areaBlock.findFirst({
        where: { areaId, startDate: { lte: date }, endDate: { gte: date } },
        select: { id: true },
      }),
      this.prisma.reservation.findMany({
        where: { areaId, date, status: ReservationStatus.CONFIRMADA },
        select: { id: true, startTime: true, unitId: true },
      }),
    ]);
    return { blocked: block !== null, reservations };
  }

  /**
   * @throws {AreaNotFoundError}
   * @throws {AreaDisabledError}
   * @throws {AreaBlockedError}
   * @throws {UnitReservationLimitError}
   * @throws {SlotTakenError}
   */
  async create(data: NewReservation): Promise<{ reservation: Reservation; area: CommonArea }> {
    const key = slotKey(data.areaId, data.date, data.startTime);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => this.createInTx(tx, data, key));
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        // Lo normal es que otra reserva haya ganado la franja. Si no, chocó el
        // consecutivo del código con otra reserva del mismo día: reintentar.
        const taken = await this.prisma.reservation.findUnique({
          where: { slotKey: key },
          select: { id: true },
        });
        if (taken || attempt >= CODE_ATTEMPTS) {
          throw new SlotTakenError(key);
        }
      }
    }
  }

  private async createInTx(tx: Tx, data: NewReservation, key: string) {
    await tx.$queryRaw`SELECT id FROM units WHERE id = ${data.unitId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM common_areas WHERE id = ${data.areaId}::uuid FOR UPDATE`;

    const area = await tx.commonArea.findUnique({ where: { id: data.areaId } });
    if (!area) {
      throw new AreaNotFoundError(data.areaId);
    }
    const slot = data.validate(area);
    if (!area.isActive) {
      throw new AreaDisabledError(area.id);
    }

    const date = toDbDate(data.date);
    const block = await tx.areaBlock.findFirst({
      where: { areaId: area.id, startDate: { lte: date }, endDate: { gte: date } },
      select: { id: true },
    });
    if (block) {
      throw new AreaBlockedError(area.id, data.date);
    }

    const active = await tx.reservation.count({
      where: { unitId: data.unitId, ...futureConfirmed(data.clock) },
    });
    if (active >= MAX_ACTIVE_RESERVATIONS_PER_UNIT) {
      throw new UnitReservationLimitError(data.unitId);
    }

    const taken = await tx.reservation.findUnique({ where: { slotKey: key }, select: { id: true } });
    if (taken) {
      throw new SlotTakenError(key);
    }

    const sameDay = await tx.reservation.count({
      where: { code: { startsWith: reservationCodePrefix(data.clock.today) } },
    });
    const reservation = await tx.reservation.create({
      data: {
        code: reservationCode(data.clock.today, sameDay + 1),
        areaId: area.id,
        unitId: data.unitId,
        userId: data.userId,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        attendees: data.attendees,
        slotKey: key,
      },
    });
    return { reservation, area };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
