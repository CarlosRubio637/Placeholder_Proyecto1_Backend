import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FEE_MESSAGES, MAX_PAGE_SIZE } from '../../fees.constants.js';
import {
  OVERDUE_UNITS_MESSAGES,
  OVERDUE_UNITS_PAGE_SIZE,
  SEARCH_MAX_LENGTH,
} from '../overdue-units.constants.js';

const trimToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class OverdueUnitsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Solo las unidades de esa torre, también en el resumen. Una torre que no existe devuelve la lista vacía.',
  })
  @IsOptional()
  @IsUUID('all', { message: OVERDUE_UNITS_MESSAGES.towerId })
  towerId?: string;

  @ApiPropertyOptional({
    maxLength: SEARCH_MAX_LENGTH,
    example: 'b-2',
    description:
      'Busca el texto dentro del código de la unidad, sin distinguir mayúsculas. No cambia el resumen.',
  })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString({ message: OVERDUE_UNITS_MESSAGES.search })
  @MaxLength(SEARCH_MAX_LENGTH, { message: OVERDUE_UNITS_MESSAGES.search })
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: FEE_MESSAGES.page })
  @Min(1, { message: FEE_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({
    default: OVERDUE_UNITS_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt({ message: FEE_MESSAGES.pageSize })
  @Min(1, { message: FEE_MESSAGES.pageSize })
  @Max(MAX_PAGE_SIZE, { message: FEE_MESSAGES.pageSize })
  pageSize: number = OVERDUE_UNITS_PAGE_SIZE;
}
