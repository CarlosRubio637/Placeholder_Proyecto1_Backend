import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { badRequest } from '@Common/validation';
import {
  currentTime,
  daysInRange,
  formatDateEs,
  fromDbDate,
  todayIso,
} from '@Common/time';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import { toSearchName } from '@Users/services';
import type { User } from '@PrismaClient';
import {
  AreaDto,
  AreaListDto,
  AreaUpdatedDto,
  BLOCK_MESSAGES,
  BlockCreatedDto,
  BlockDto,
  type CreateAreaDto,
  type CreateBlockDto,
  type UpdateAreaDto,
} from '../dto/index.js';
import {
  AffectedReservationsError,
  AreaNameTakenError,
  AreaNotFoundError,
  BlockNotFoundError,
} from '../errors/index.js';
import {
  AreaRepository,
  type AreaData,
  type CancelledReservation,
  type Clock,
} from '../repositories/index.js';
import { validateSchedule } from '../utils/index.js';

/** Máximo de días de un bloqueo (rango inclusivo). */
export const MAX_BLOCK_DAYS = 90;

/** Cuerpo del 409 de H9 cuando un cambio cancelaría reservas. */
export function affectedReservationsBody(affectedCount: number) {
  return {
    statusCode: 409,
    error: 'Conflict',
    code: 'RESERVAS_AFECTADAS',
    affectedCount,
    message: `Este cambio cancelará ${affectedCount} ${affectedCount === 1 ? 'reserva confirmada' : 'reservas confirmadas'} y se avisará a los residentes.`,
  };
}

/**
 * Administración de áreas comunes y bloqueos (H9). Los cambios que cancelan
 * reservas exigen confirmación (409 RESERVAS_AFECTADAS) y, después de la
 * transacción, avisan a cada residente afectado (H30).
 */
@Injectable()
export class AreasService {
  private readonly logger = new Logger(AreasService.name);

  constructor(
    private readonly repository: AreaRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async list(now = new Date()): Promise<AreaListDto> {
    const areas = await this.repository.listWithStats(clockAt(now));
    return {
      data: areas.map((area) =>
        Object.assign(AreaDto.fromEntity(area), {
          futureReservations: area._count.reservations,
          blocks: area.blocks.map((block) => BlockDto.fromEntity(block)),
        }),
      ),
    };
  }

  async create(actor: User, dto: CreateAreaDto): Promise<AreaDto> {
    const data: AreaData = {
      name: dto.name,
      nameKey: toSearchName(dto.name),
      capacity: dto.capacity,
      rules: dto.rules ?? null,
      openTime: dto.openTime,
      closeTime: dto.closeTime,
      slotMinutes: dto.slotMinutes,
      isActive: dto.isActive ?? true,
    };
    assertValidSchedule(data);

    try {
      return AreaDto.fromEntity(await this.repository.create(data, actor.id));
    } catch (error) {
      throw toHttpError(error);
    }
  }

  async update(
    actor: User,
    areaId: string,
    dto: UpdateAreaDto,
    now = new Date(),
  ): Promise<AreaUpdatedDto> {
    const { confirmCancellations, ...fields } = dto;
    const changes: Partial<AreaData> = { ...fields };
    if (fields.name !== undefined) {
      changes.nameKey = toSearchName(fields.name);
    }
    if (fields.rules !== undefined) {
      changes.rules = fields.rules ?? null;
    }

    let result;
    try {
      result = await this.repository.updateWithCancellations({
        areaId,
        changes,
        actorId: actor.id,
        confirm: confirmCancellations === true,
        clock: clockAt(now),
        validate: assertValidSchedule,
      });
    } catch (error) {
      throw toHttpError(error);
    }

    await this.notifyCancelled(result.cancelled);
    return {
      area: AreaDto.fromEntity(result.area),
      cancelledReservations: result.cancelled.length,
    };
  }

  async createBlock(
    actor: User,
    areaId: string,
    dto: CreateBlockDto,
    now = new Date(),
  ): Promise<BlockCreatedDto> {
    const clock = clockAt(now);
    if (dto.startDate < clock.today) {
      throw badRequest('startDate', BLOCK_MESSAGES.pastStart);
    }
    if (dto.endDate < dto.startDate) {
      throw badRequest('endDate', BLOCK_MESSAGES.endBeforeStart);
    }
    if (daysInRange(dto.startDate, dto.endDate) > MAX_BLOCK_DAYS) {
      throw badRequest('endDate', BLOCK_MESSAGES.tooLong);
    }

    let result;
    try {
      result = await this.repository.createBlockWithCancellations({
        areaId,
        startDate: dto.startDate,
        endDate: dto.endDate,
        reason: dto.reason,
        actorId: actor.id,
        confirm: dto.confirmCancellations === true,
        clock,
      });
    } catch (error) {
      throw toHttpError(error);
    }

    await this.notifyCancelled(result.cancelled);
    return {
      block: BlockDto.fromEntity(result.block),
      cancelledReservations: result.cancelled.length,
    };
  }

  async deleteBlock(areaId: string, blockId: string): Promise<void> {
    try {
      await this.repository.deleteBlock(areaId, blockId);
    } catch (error) {
      throw toHttpError(error);
    }
  }

  /**
   * Un aviso por reserva cancelada, al residente que reservó (H9 + H30). Se
   * envía después de la transacción: si un aviso falla, la cancelación ya
   * quedó y solo se deja constancia en el log.
   */
  private async notifyCancelled(cancelled: CancelledReservation[]): Promise<void> {
    for (const reservation of cancelled) {
      try {
        await this.notifications.send({
          recipient: { type: RecipientType.USUARIO, ids: [reservation.userId] },
          title: 'Reserva cancelada por la administración',
          // Sin el punto final del motivo, para no terminar en "..".
          message: `Tu reserva ${reservation.code} de ${reservation.areaName} el ${formatDateEs(fromDbDate(reservation.date))} fue cancelada: ${reservation.reason.replace(/[.\s]+$/, '')}.`.slice(0, 500),
          sourceModule: SourceModule.RESERVAS,
          reference: { type: 'reservation', id: reservation.id },
        });
      } catch (error) {
        this.logger.error(
          `No se pudo avisar la cancelación de la reserva ${reservation.code}`,
          error,
        );
      }
    }
  }
}

function clockAt(now: Date): Clock {
  return { today: todayIso(now), time: currentTime(now), now };
}

function assertValidSchedule(area: AreaData): void {
  const error = validateSchedule(area);
  if (error) {
    throw badRequest(error.field, error.message);
  }
}

function toHttpError(error: unknown): unknown {
  if (error instanceof AreaNotFoundError) {
    return new NotFoundException('El área no existe.');
  }
  if (error instanceof BlockNotFoundError) {
    return new NotFoundException('El bloqueo no existe.');
  }
  if (error instanceof AreaNameTakenError) {
    return new ConflictException('Ya existe un área con ese nombre.');
  }
  if (error instanceof AffectedReservationsError) {
    return new ConflictException(affectedReservationsBody(error.affectedCount));
  }
  return error;
}
