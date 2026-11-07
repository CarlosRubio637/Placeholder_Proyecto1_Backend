import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { toDbDate } from '@Common/time';
import {
  Prisma,
  ReservationStatus,
  type AreaBlock,
  type CommonArea,
} from '@PrismaClient';
import {
  AffectedReservationsError,
  AreaNameTakenError,
  AreaNotFoundError,
  BlockNotFoundError,
} from '../errors/index.js';
import {
  reservationsAffectedByChange,
  type AreaSchedule,
} from '../utils/index.js';

type Tx = Prisma.TransactionClient;

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** "Ahora" en el condominio, ya calculado por el servicio. */
export interface Clock {
  /** "AAAA-MM-DD" */
  today: string;
  /** "HH:mm" */
  time: string;
  /** Momento exacto, para cancelledAt. */
  now: Date;
}

export interface AreaData {
  name: string;
  nameKey: string;
  capacity: number;
  rules: string | null;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  isActive: boolean;
}

/** Reserva cancelada, con lo necesario para avisar al residente (H9 + H30). */
export interface CancelledReservation {
  id: string;
  code: string;
  userId: string;
  date: Date;
  areaName: string;
  reason: string;
}

export type AreaWithStats = CommonArea & {
  blocks: AreaBlock[];
  _count: { reservations: number };
};

/**
 * Reserva confirmada que todavía no empieza: fecha futura, o de hoy con la
 * hora de inicio por delante. Las pasadas nunca se modifican (H9).
 */
export function futureConfirmed(clock: Clock): Prisma.ReservationWhereInput {
  return {
    status: ReservationStatus.CONFIRMADA,
    OR: [
      { date: { gt: toDbDate(clock.today) } },
      { date: toDbDate(clock.today), startTime: { gt: clock.time } },
    ],
  };
}

/**
 * Acceso a datos de áreas comunes, bloqueos y su efecto sobre las reservas
 * (H9). Los cambios que cancelan reservas bloquean antes la fila del área
 * (`FOR UPDATE`), así se serializan con otros cambios y con las reservas
 * nuevas de H7 sobre la misma área.
 */
@Injectable()
export class AreaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Áreas por nombre, con reservas futuras y bloqueos actuales y futuros. */
  listWithStats(clock: Clock): Promise<AreaWithStats[]> {
    return this.prisma.commonArea.findMany({
      orderBy: { nameKey: 'asc' },
      include: {
        blocks: {
          where: { endDate: { gte: toDbDate(clock.today) } },
          orderBy: { startDate: 'asc' },
        },
        _count: { select: { reservations: { where: futureConfirmed(clock) } } },
      },
    });
  }

  findById(id: string): Promise<CommonArea | null> {
    return this.prisma.commonArea.findUnique({ where: { id } });
  }

  /** @throws {AreaNameTakenError} */
  async create(data: AreaData, actorId: string): Promise<CommonArea> {
    try {
      return await this.prisma.commonArea.create({
        data: { ...data, updatedById: actorId },
      });
    } catch (error) {
      throw this.translateUnique(error, data.name);
    }
  }

  /**
   * Aplica los cambios al área y cancela las reservas futuras que dejan de
   * ser válidas, todo en una transacción (H9).
   *
   * @throws {AreaNotFoundError}
   * @throws {AffectedReservationsError} si hay reservas afectadas y no se confirmó.
   * @throws {AreaNameTakenError}
   */
  async updateWithCancellations(params: {
    areaId: string;
    changes: Partial<AreaData>;
    actorId: string;
    confirm: boolean;
    clock: Clock;
    /** Valida el área ya combinada con los cambios; lanza si es inválida. */
    validate: (next: AreaData) => void;
  }): Promise<{ area: CommonArea; cancelled: CancelledReservation[] }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.lockArea(tx, params.areaId);
        const next: AreaData = { ...pickAreaData(current), ...params.changes };
        params.validate(next);

        const future = await tx.reservation.findMany({
          where: { areaId: current.id, ...futureConfirmed(params.clock) },
          select: { id: true, startTime: true, endTime: true },
        });
        const affected = reservationsAffectedByChange(next, current as AreaSchedule, future);
        if (affected.ids.length > 0 && !params.confirm) {
          throw new AffectedReservationsError(affected.ids.length);
        }

        const area = await tx.commonArea.update({
          where: { id: current.id },
          data: { ...params.changes, updatedById: params.actorId },
        });
        const cancelled = await this.cancel(tx, affected.ids, {
          areaName: area.name,
          reason: affected.reason,
          actorId: params.actorId,
          now: params.clock.now,
        });
        return { area, cancelled };
      });
    } catch (error) {
      throw this.translateUnique(error, params.changes.name ?? '');
    }
  }

  /**
   * Registra un bloqueo y cancela las reservas futuras confirmadas dentro del
   * rango, en una transacción (H9).
   *
   * @throws {AreaNotFoundError}
   * @throws {AffectedReservationsError} si hay reservas afectadas y no se confirmó.
   */
  createBlockWithCancellations(params: {
    areaId: string;
    startDate: string;
    endDate: string;
    reason: string;
    actorId: string;
    confirm: boolean;
    clock: Clock;
  }): Promise<{ block: AreaBlock; cancelled: CancelledReservation[] }> {
    return this.prisma.$transaction(async (tx) => {
      const area = await this.lockArea(tx, params.areaId);

      const affected = await tx.reservation.findMany({
        where: {
          areaId: area.id,
          date: { gte: toDbDate(params.startDate), lte: toDbDate(params.endDate) },
          ...futureConfirmed(params.clock),
        },
        select: { id: true },
      });
      if (affected.length > 0 && !params.confirm) {
        throw new AffectedReservationsError(affected.length);
      }

      const block = await tx.areaBlock.create({
        data: {
          areaId: area.id,
          startDate: toDbDate(params.startDate),
          endDate: toDbDate(params.endDate),
          reason: params.reason,
          createdById: params.actorId,
        },
      });
      const cancelled = await this.cancel(
        tx,
        affected.map((r) => r.id),
        {
          areaName: area.name,
          reason: params.reason,
          actorId: params.actorId,
          now: params.clock.now,
        },
      );
      return { block, cancelled };
    });
  }

  /**
   * Borra un bloqueo del área. No restaura las reservas que canceló (H9).
   *
   * @throws {BlockNotFoundError} si no existe o es de otra área.
   */
  async deleteBlock(areaId: string, blockId: string): Promise<void> {
    const { count } = await this.prisma.areaBlock.deleteMany({
      where: { id: blockId, areaId },
    });
    if (count === 0) {
      throw new BlockNotFoundError(blockId);
    }
  }

  private async lockArea(tx: Tx, areaId: string): Promise<CommonArea> {
    await tx.$queryRaw`SELECT id FROM common_areas WHERE id = ${areaId}::uuid FOR UPDATE`;
    const area = await tx.commonArea.findUnique({ where: { id: areaId } });
    if (!area) {
      throw new AreaNotFoundError(areaId);
    }
    return area;
  }

  /**
   * Pasa las reservas a CANCELADA_ADMIN con motivo y autor, y libera su
   * franja (slotKey = null). Devuelve los datos para avisar a cada residente.
   */
  private async cancel(
    tx: Tx,
    ids: string[],
    info: { areaName: string; reason: string; actorId: string; now: Date },
  ): Promise<CancelledReservation[]> {
    if (ids.length === 0) {
      return [];
    }
    await tx.reservation.updateMany({
      where: { id: { in: ids } },
      data: {
        status: ReservationStatus.CANCELADA_ADMIN,
        slotKey: null,
        cancelledAt: info.now,
        cancelledById: info.actorId,
        cancelReason: info.reason.slice(0, 200),
      },
    });
    const rows = await tx.reservation.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, userId: true, date: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map((row) => ({ ...row, areaName: info.areaName, reason: info.reason }));
  }

  private translateUnique(error: unknown, name: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return new AreaNameTakenError(name);
    }
    return error;
  }
}

function pickAreaData(area: CommonArea): AreaData {
  return {
    name: area.name,
    nameKey: area.nameKey,
    capacity: area.capacity,
    rules: area.rules,
    openTime: area.openTime,
    closeTime: area.closeTime,
    slotMinutes: area.slotMinutes,
    isActive: area.isActive,
  };
}
