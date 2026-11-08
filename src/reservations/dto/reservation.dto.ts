import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsISO8601, IsUUID, Matches } from 'class-validator';
import { fromDbDate } from '@Common/time';
import { ReservationStatus, type CommonArea, type Reservation } from '@PrismaClient';
import type { SlotStatus } from '../utils/index.js';

/** Mensajes de H7. */
export const RESERVATION_MESSAGES = {
  areaId: 'El área no es válida.',
  date: 'Usa una fecha válida (AAAA-MM-DD).',
  startTime: 'Usa una hora válida (HH:mm).',
  attendees: (capacity: number) => `El área admite máximo ${capacity} personas.`,
  attendeesInteger: 'El número de personas debe ser un entero.',
  acceptRules: 'Debes aceptar las reglas de uso.',
  past: 'No puedes reservar una fecha u hora pasada.',
  tooFar: (limit: string) => `La fecha debe estar entre hoy y ${limit}.`,
  slot: 'La franja no coincide con el horario del área.',
  disabled: 'El área está deshabilitada.',
  blocked: 'El área está bloqueada por mantenimiento en esa fecha.',
  slotTaken: 'Esta franja ya fue reservada por otra unidad.',
  unitLimit: 'Tu unidad ya tiene 2 reservas activas.',
} as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Cuerpo de POST /reservas (H7). */
export class CreateReservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: RESERVATION_MESSAGES.areaId })
  areaId!: string;

  @ApiProperty({ example: '2026-11-10', description: 'AAAA-MM-DD, de hoy a 30 días.' })
  @Matches(DATE_ONLY, { message: RESERVATION_MESSAGES.date })
  @IsISO8601({ strict: true }, { message: RESERVATION_MESSAGES.date })
  date!: string;

  @ApiProperty({ example: '10:00', description: 'Inicio de una franja del área, HH:mm.' })
  @Matches(TIME, { message: RESERVATION_MESSAGES.startTime })
  startTime!: string;

  @ApiProperty({ example: 4, minimum: 1, description: 'De 1 al aforo del área.' })
  @IsInt({ message: RESERVATION_MESSAGES.attendeesInteger })
  attendees!: number;

  @ApiProperty({ example: true, description: 'Debe ser true.' })
  @IsIn([true], { message: RESERVATION_MESSAGES.acceptRules })
  acceptRules!: boolean;
}

class ReservationAreaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Piscina' }) name!: string;
}

/** Comprobante de una reserva (H7). */
export class ReservationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'RS-20261106-0001' }) code!: string;
  @ApiProperty({ type: ReservationAreaDto }) area!: ReservationAreaDto;
  @ApiProperty({ example: '2026-11-10' }) date!: string;
  @ApiProperty({ example: '10:00' }) startTime!: string;
  @ApiProperty({ example: '11:00' }) endTime!: string;
  @ApiProperty({ example: 4 }) attendees!: number;
  @ApiProperty({ enum: ReservationStatus }) status!: ReservationStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static fromEntity(reservation: Reservation, area: Pick<CommonArea, 'id' | 'name'>): ReservationDto {
    return {
      id: reservation.id,
      code: reservation.code,
      area: { id: area.id, name: area.name },
      date: fromDbDate(reservation.date),
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      attendees: reservation.attendees,
      status: reservation.status,
      createdAt: reservation.createdAt,
    };
  }
}

/** Área habilitada tal como la ve el residente (H6 y H7). */
export class PublicAreaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Piscina' }) name!: string;
  @ApiProperty({ example: 30 }) capacity!: number;
  @ApiProperty({ type: String, nullable: true }) rules!: string | null;
  @ApiProperty({ example: '08:00' }) openTime!: string;
  @ApiProperty({ example: '20:00' }) closeTime!: string;
  @ApiProperty({ enum: [60, 120] }) slotMinutes!: number;

  static fromEntity(area: CommonArea): PublicAreaDto {
    return {
      id: area.id,
      name: area.name,
      capacity: area.capacity,
      rules: area.rules,
      openTime: area.openTime,
      closeTime: area.closeTime,
      slotMinutes: area.slotMinutes,
    };
  }
}

export class PublicAreaListDto {
  @ApiProperty({ type: [PublicAreaDto] }) data!: PublicAreaDto[];
}

/** Consulta de GET /areas/:areaId/disponibilidad (H6). */
export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-11-10', description: 'AAAA-MM-DD, de hoy a 30 días.' })
  @Matches(DATE_ONLY, { message: RESERVATION_MESSAGES.date })
  @IsISO8601({ strict: true }, { message: RESERVATION_MESSAGES.date })
  date!: string;
}

class AvailabilitySlotDto {
  @ApiProperty({ example: '10:00' }) startTime!: string;
  @ApiProperty({ example: '11:00' }) endTime!: string;
  @ApiProperty({ enum: ['DISPONIBLE', 'RESERVADO', 'MANTENIMIENTO', 'PASADO'] })
  status!: SlotStatus;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Solo si la reserva es de la unidad que consulta.',
  })
  ownReservationId!: string | null;
}

/** Franjas de un área en una fecha (H6). */
export class AvailabilityDto {
  @ApiProperty({ format: 'uuid' }) areaId!: string;
  @ApiProperty({ example: '2026-11-10' }) date!: string;
  @ApiProperty({ type: [AvailabilitySlotDto] }) slots!: AvailabilitySlotDto[];
}
