import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsString, Length } from 'class-validator';
import { IncidentStatus } from '@PrismaClient';

export const NOTE_MIN = 10;
export const NOTE_MAX = 500;

/** Estados a los que se puede pasar (H13). Pendiente solo es el inicial. */
export const TARGET_STATUSES = [
  IncidentStatus.EN_PROCESO,
  IncidentStatus.RESUELTO,
] as const;

/** Nombre de cada estado, para los avisos y los mensajes de H13. */
export const STATUS_LABELS: Record<IncidentStatus, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  RESUELTO: 'Resuelto',
};

/** Mensajes de H13. */
export const STATUS_MESSAGES = {
  toStatus: 'El estado nuevo debe ser EN_PROCESO o RESUELTO.',
  note: `Escribe una observación de ${NOTE_MIN} a ${NOTE_MAX} caracteres.`,
  expectedStatus: 'Indica el estado que viste en la incidencia.',
  notAllowed: (from: IncidentStatus, to: IncidentStatus) =>
    `No se puede pasar de ${STATUS_LABELS[from]} a ${STATUS_LABELS[to]}.`,
  needsAssignee: 'Asigna un responsable antes de iniciar la atención.',
  changed: 'La incidencia cambió de estado. Actualiza la página.',
  notFound: 'La incidencia no existe.',
} as const;

/** Cuerpo de POST /admin/incidencias/:id/estado (H13). */
export class ChangeStatusDto {
  @ApiProperty({ enum: TARGET_STATUSES })
  @IsIn(TARGET_STATUSES, { message: STATUS_MESSAGES.toStatus })
  toStatus!: (typeof TARGET_STATUSES)[number];

  @ApiProperty({ minLength: NOTE_MIN, maxLength: NOTE_MAX })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: STATUS_MESSAGES.note })
  @Length(NOTE_MIN, NOTE_MAX, { message: STATUS_MESSAGES.note })
  note!: string;

  @ApiProperty({
    enum: IncidentStatus,
    description: 'Estado que el administrador vio; si cambió, responde 409.',
  })
  @IsEnum(IncidentStatus, { message: STATUS_MESSAGES.expectedStatus })
  expectedStatus!: IncidentStatus;
}

/** Respuesta 201 de POST /admin/incidencias/:id/estado. */
export class StatusChangedDto {
  @ApiProperty()
  incident!: {
    id: string;
    status: IncidentStatus;
    resolvedAt: Date | null;
  };

  @ApiProperty()
  event!: {
    id: string;
    fromStatus: IncidentStatus;
    toStatus: IncidentStatus;
    note: string;
    createdAt: Date;
  };
}
