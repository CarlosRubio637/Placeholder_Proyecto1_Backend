import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FORBIDDEN_BODY } from '@Auth/guards';
import { badRequest } from '@Common/validation';
import { addDays, currentTime, formatDateEs, fromDbDate, todayIso } from '@Common/time';
import {
  NotificationsService,
  RecipientType,
  SourceModule,
} from '@Notifications';
import type { CommonArea, Reservation, User } from '@PrismaClient';
import {
  AvailabilityDto,
  PublicAreaDto,
  PublicAreaListDto,
  RESERVATION_MESSAGES,
  ReservationDto,
  type CreateReservationDto,
} from '../dto/index.js';
import {
  AreaBlockedError,
  AreaDisabledError,
  AreaNotFoundError,
  SlotTakenError,
  UnitReservationLimitError,
} from '../errors/index.js';
import { ReservationRepository, type Clock } from '../repositories/index.js';
import { buildAvailability, findSlot, MAX_DAYS_AHEAD } from '../utils/index.js';

/**
 * Reservas de áreas comunes de los residentes (H7) y catálogo de áreas
 * habilitadas (H6 y H7).
 */
@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly repository: ReservationRepository,
    private readonly notifications: NotificationsService,
  ) {}

  async listAreas(): Promise<PublicAreaListDto> {
    const areas = await this.repository.listActiveAreas();
    return { data: areas.map((area) => PublicAreaDto.fromEntity(area)) };
  }

  /**
   * Franjas de un área en una fecha, entre hoy y 30 días (H6). Solo marca como
   * propias las reservas de la unidad de quien consulta.
   */
  async availability(
    user: User,
    areaId: string,
    date: string,
    now = new Date(),
  ): Promise<AvailabilityDto> {
    const today = todayIso(now);
    const lastDay = addDays(today, MAX_DAYS_AHEAD);
    if (date < today || date > lastDay) {
      throw badRequest('date', RESERVATION_MESSAGES.tooFar(formatDateEs(lastDay)));
    }

    const area = await this.repository.findActiveArea(areaId);
    if (!area) {
      throw new NotFoundException('El área no existe.');
    }

    const { blocked, reservations } = await this.repository.findDayOccupancy(area.id, date);
    return {
      areaId: area.id,
      date,
      slots: buildAvailability({
        schedule: area,
        blocked,
        currentTime: date === today ? currentTime(now) : null,
        reservations,
        unitId: user.unitId,
      }),
    };
  }

  /**
   * Reserva una franja para la unidad del residente autenticado (H7). Las
   * validaciones que no dependen del área van antes de la transacción; las
   * demás, con el área y la unidad bloqueadas.
   */
  async create(
    resident: User,
    dto: CreateReservationDto,
    now = new Date(),
  ): Promise<ReservationDto> {
    if (!resident.unitId) {
      throw new ForbiddenException(FORBIDDEN_BODY);
    }
    const clock: Clock = { today: todayIso(now), time: currentTime(now), now };

    if (dto.date < clock.today) {
      throw badRequest('date', RESERVATION_MESSAGES.past);
    }
    if (dto.date === clock.today && dto.startTime <= clock.time) {
      throw badRequest('startTime', RESERVATION_MESSAGES.past);
    }
    const lastDay = addDays(clock.today, MAX_DAYS_AHEAD);
    if (dto.date > lastDay) {
      throw badRequest('date', RESERVATION_MESSAGES.tooFar(formatDateEs(lastDay)));
    }

    let result;
    try {
      result = await this.repository.create({
        areaId: dto.areaId,
        unitId: resident.unitId,
        userId: resident.id,
        date: dto.date,
        startTime: dto.startTime,
        attendees: dto.attendees,
        clock,
        validate: (area) => {
          const slot = findSlot(area, dto.startTime);
          if (!slot) {
            throw badRequest('startTime', RESERVATION_MESSAGES.slot);
          }
          if (dto.attendees < 1 || dto.attendees > area.capacity) {
            throw badRequest('attendees', RESERVATION_MESSAGES.attendees(area.capacity));
          }
          return slot;
        },
      });
    } catch (error) {
      throw toHttpError(error);
    }

    await this.notifyConfirmed(result.reservation, result.area);
    return ReservationDto.fromEntity(result.reservation, result.area);
  }

  /**
   * Aviso al residente que reservó (H7 + H30). Se envía después de la
   * transacción: si falla, la reserva ya quedó y solo se deja constancia.
   */
  private async notifyConfirmed(reservation: Reservation, area: CommonArea): Promise<void> {
    try {
      await this.notifications.send({
        recipient: { type: RecipientType.USUARIO, ids: [reservation.userId] },
        title: 'Reserva confirmada',
        message: `Tu reserva ${reservation.code} de ${area.name} el ${formatDateEs(fromDbDate(reservation.date))} de ${reservation.startTime} a ${reservation.endTime} está confirmada.`,
        sourceModule: SourceModule.RESERVAS,
        reference: { type: 'reservation', id: reservation.id },
      });
    } catch (error) {
      this.logger.error(`No se pudo avisar la reserva ${reservation.code}`, error);
    }
  }
}

function toHttpError(error: unknown): unknown {
  if (error instanceof AreaNotFoundError) {
    return new NotFoundException('El área no existe.');
  }
  if (error instanceof AreaDisabledError) {
    return new ConflictException(RESERVATION_MESSAGES.disabled);
  }
  if (error instanceof AreaBlockedError) {
    return new ConflictException(RESERVATION_MESSAGES.blocked);
  }
  if (error instanceof UnitReservationLimitError) {
    return new ConflictException(RESERVATION_MESSAGES.unitLimit);
  }
  if (error instanceof SlotTakenError) {
    return new ConflictException(RESERVATION_MESSAGES.slotTaken);
  }
  return error;
}
