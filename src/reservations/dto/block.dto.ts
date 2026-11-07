import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';

export const BLOCK_MESSAGES = {
  date: 'Usa una fecha válida (AAAA-MM-DD).',
  reason: 'El motivo debe tener de 5 a 200 caracteres.',
  pastStart: 'La fecha de inicio no puede ser anterior a hoy.',
  endBeforeStart: 'La fecha de fin no puede ser anterior a la de inicio.',
  tooLong: 'El bloqueo puede durar máximo 90 días.',
} as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Cuerpo de POST /admin/areas/:id/bloqueos (H9). */
export class CreateBlockDto {
  @ApiProperty({ example: '2026-11-10', description: 'AAAA-MM-DD, no anterior a hoy.' })
  @Matches(DATE_ONLY, { message: BLOCK_MESSAGES.date })
  @IsISO8601({ strict: true }, { message: BLOCK_MESSAGES.date })
  startDate!: string;

  @ApiProperty({
    example: '2026-11-12',
    description: 'AAAA-MM-DD, no anterior al inicio; rango de 1 a 90 días.',
  })
  @Matches(DATE_ONLY, { message: BLOCK_MESSAGES.date })
  @IsISO8601({ strict: true }, { message: BLOCK_MESSAGES.date })
  endDate!: string;

  @ApiProperty({ example: 'Mantenimiento de la bomba', minLength: 5, maxLength: 200 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: BLOCK_MESSAGES.reason })
  @Length(5, 200, { message: BLOCK_MESSAGES.reason })
  reason!: string;

  @ApiPropertyOptional({
    description:
      'true para bloquear aunque cancele reservas confirmadas. Sin él, responde 409 RESERVAS_AFECTADAS.',
  })
  @IsOptional()
  @IsBoolean()
  confirmCancellations?: boolean;
}
