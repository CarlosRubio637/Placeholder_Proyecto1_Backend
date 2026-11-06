import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Mensajes de H9. */
export const AREA_MESSAGES = {
  name: 'El nombre debe tener de 3 a 50 caracteres.',
  capacity: 'El aforo debe ser un entero entre 1 y 500.',
  rules: 'Las reglas de uso pueden tener máximo 500 caracteres.',
  time: 'Usa una hora en pasos de 30 minutos (HH:mm).',
  slot: 'La duración de la franja debe ser de 60 o 120 minutos.',
} as const;

/** "HH:mm" en pasos de 30 minutos: 00:00, 00:30, ..., 23:30. */
const HALF_HOUR = /^([01]\d|2[0-3]):(00|30)$/;

/** Cuerpo de POST /admin/areas (H9). */
export class CreateAreaDto {
  @ApiProperty({ example: 'Piscina', minLength: 3, maxLength: 50 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString({ message: AREA_MESSAGES.name })
  @Length(3, 50, { message: AREA_MESSAGES.name })
  name!: string;

  @ApiProperty({ example: 30, minimum: 1, maximum: 500 })
  @IsInt({ message: AREA_MESSAGES.capacity })
  @Min(1, { message: AREA_MESSAGES.capacity })
  @Max(500, { message: AREA_MESSAGES.capacity })
  capacity!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 500,
    example: 'Uso obligatorio de gorro. Prohibido el vidrio.',
  })
  // Vacío o solo espacios cuenta como "sin reglas".
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString({ message: AREA_MESSAGES.rules })
  @MaxLength(500, { message: AREA_MESSAGES.rules })
  rules?: string | null;

  @ApiProperty({ example: '08:00', description: 'HH:mm en pasos de 30 minutos.' })
  @IsString({ message: AREA_MESSAGES.time })
  @Matches(HALF_HOUR, { message: AREA_MESSAGES.time })
  openTime!: string;

  @ApiProperty({ example: '20:00', description: 'HH:mm, posterior a la apertura.' })
  @IsString({ message: AREA_MESSAGES.time })
  @Matches(HALF_HOUR, { message: AREA_MESSAGES.time })
  closeTime!: string;

  @ApiProperty({ enum: [60, 120], example: 60 })
  @IsIn([60, 120], { message: AREA_MESSAGES.slot })
  slotMinutes!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Cuerpo de PATCH /admin/areas/:id (H9): los mismos campos, opcionales. */
export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @ApiPropertyOptional({
    description:
      'true para aplicar el cambio aunque cancele reservas confirmadas. Sin él, responde 409 RESERVAS_AFECTADAS.',
  })
  @IsOptional()
  @IsBoolean()
  confirmCancellations?: boolean;
}
