import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  FEE_MESSAGES,
  MAX_CONCEPT_LENGTH,
  MAX_FEE_AMOUNT,
  MIN_FEE_AMOUNT,
} from '../fees.constants.js';

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const trimToUndefined = ({ value }: { value: unknown }) => {
  const text = typeof value === 'string' ? value.trim() : value;
  return text === '' ? undefined : text;
};

export class GenerateFeesDto {
  @ApiProperty({
    example: '2026-12',
    description: 'AAAA-MM, del mes actual a 3 meses adelante.',
  })
  @Matches(PERIOD_PATTERN, { message: FEE_MESSAGES.periodFormat })
  period!: string;

  @ApiProperty({
    example: 35.5,
    minimum: MIN_FEE_AMOUNT,
    maximum: MAX_FEE_AMOUNT,
    description: 'Monto por unidad, con 2 decimales como máximo.',
  })
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: FEE_MESSAGES.amount },
  )
  @Min(MIN_FEE_AMOUNT, { message: FEE_MESSAGES.amount })
  @Max(MAX_FEE_AMOUNT, { message: FEE_MESSAGES.amount })
  amount!: number;

  @ApiProperty({
    example: '2026-12-10',
    description: 'AAAA-MM-DD, dentro del periodo y no anterior a hoy.',
  })
  @Matches(DATE_ONLY, { message: FEE_MESSAGES.dueDateFormat })
  @IsISO8601({ strict: true }, { message: FEE_MESSAGES.dueDateFormat })
  dueDate!: string;

  @ApiPropertyOptional({
    example: 'Cuota de mantenimiento diciembre 2026',
    maxLength: MAX_CONCEPT_LENGTH,
    description: 'Si falta o va vacío, se usa el concepto por defecto.',
  })
  @Transform(trimToUndefined)
  @IsOptional()
  @IsString({ message: FEE_MESSAGES.concept })
  @MaxLength(MAX_CONCEPT_LENGTH, { message: FEE_MESSAGES.concept })
  concept?: string;
}
