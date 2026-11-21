import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { fromDbDate } from '@Common/time';
import {
  ReservationStatus,
  type CommonArea,
  type Reservation,
} from '@PrismaClient';
import type { SlotStatus } from '../utils/index.js';

/** Mensajes de H7. */
export const RESERVATION_MESSAGES = {
  areaId: 'El área no es válida.',
  date: 'Usa una fecha válida (AAAA-MM-DD).',
  startTime: 'Usa una hora válida (HH:mm).',
  attendees: (capacity: number) =>
    `El área admite máximo ${capacity} personas.`,
  attendeesInteger: 'El número de personas debe ser un entero.',
  acceptRules: 'Debes aceptar las reglas de uso.',
  past: 'No puedes reservar una fecha u hora pasada.',
  tooFar: (limit: string) => `La fecha debe estar entre hoy y ${limit}.`,
  slot: 'La franja no coincide con el horario del área.',
  disabled: 'El área está deshabilitada.',
  blocked: 'El área está bloqueada por mantenimiento en esa fecha.',
  slotTaken: 'Esta franja ya fue reservada por otra unidad.',
  unitLimit: 'Tu unidad ya tiene 2 reservas activas.',
  tab: 'La pestaña debe ser proximas o historial.',
  page: 'La página debe ser un entero mayor o igual a 1.',
  pageSize: 'El tamaño de página debe ser un entero de 1 a 50.',
  notFound: 'La reserva no existe.',
  notActive: 'La reserva ya está cancelada.',
  tooLate: 'Solo puedes cancelar con al menos 24 horas de anticipación.',
} as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Cuerpo de POST /reservas (H7). */
export class CreateReservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: RESERVATION_MESSAGES.areaId })
  areaId!: string;

  @ApiProperty({
    example: '2026-11-10',
    description: 'AAAA-MM-DD, de hoy a 30 días.',
  })
  @Matches(DATE_ONLY, { message: RESERVATION_MESSAGES.date })
  @IsISO8601({ strict: true }, { message: RESERVATION_MESSAGES.date })
  date!: string;

  @ApiProperty({
    example: '10:00',
    description: 'Inicio de una franja del área, HH:mm.',
  })
  @Matches(TIME, { message: RESERVATION_MESSAGES.startTime })
  startTime!: string;

  @ApiProperty({
    example: 4,
    minimum: 1,
    description: 'De 1 al aforo del área.',
  })
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

  static fromEntity(
    reservation: Reservation,
    area: Pick<CommonArea, 'id' | 'name'>,
  ): ReservationDto {
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
  @ApiProperty({
    example: '2026-11-10',
    description: 'AAAA-MM-DD, de hoy a 30 días.',
  })
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

export const MY_RESERVATION_TABS = ['proximas', 'historial'] as const;
export type MyReservationTab = (typeof MY_RESERVATION_TABS)[number];

/** Consulta de GET /reservas/mias (H8). */
export class MyReservationsQueryDto {
  @ApiPropertyOptional({ enum: MY_RESERVATION_TABS, default: 'proximas' })
  @IsOptional()
  @IsIn(MY_RESERVATION_TABS, { message: RESERVATION_MESSAGES.tab })
  tab: MyReservationTab = 'proximas';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: RESERVATION_MESSAGES.page })
  @Min(1, { message: RESERVATION_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt({ message: RESERVATION_MESSAGES.pageSize })
  @Min(1, { message: RESERVATION_MESSAGES.pageSize })
  @Max(50, { message: RESERVATION_MESSAGES.pageSize })
  pageSize: number = 10;
}

/** Fila de Mis reservas (H8). */
export class MyReservationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'RS-20261106-0001' }) code!: string;
  @ApiProperty({ type: ReservationAreaDto }) area!: ReservationAreaDto;
  @ApiProperty({ example: '2026-11-10' }) date!: string;
  @ApiProperty({ example: '10:00' }) startTime!: string;
  @ApiProperty({ example: '11:00' }) endTime!: string;
  @ApiProperty({ example: 4 }) attendees!: number;
  @ApiProperty({ enum: ReservationStatus }) status!: ReservationStatus;
  @ApiProperty({ example: 'Ana López', description: 'Residente que reservó.' })
  reservedBy!: string;
  @ApiProperty({
    description: 'Confirmada y faltan al menos 24 horas para su inicio.',
  })
  canCancel!: boolean;
}

export class MyReservationsPageDto {
  @ApiProperty({ type: [MyReservationDto] }) data!: MyReservationDto[];
  @ApiProperty({ example: 3 }) total!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 10 }) pageSize!: number;
}

/** Respuesta de PATCH /reservas/:id/cancelar (H8). */
export class CancelledReservationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: [ReservationStatus.CANCELADA] })
  status!: ReservationStatus;
  @ApiProperty({ type: String, format: 'date-time' }) cancelledAt!: Date;
}
