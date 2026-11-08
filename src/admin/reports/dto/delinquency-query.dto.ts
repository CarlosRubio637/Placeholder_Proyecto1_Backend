import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  DELINQUENCY_MAX_PAGE_SIZE,
  DELINQUENCY_MESSAGES,
  DELINQUENCY_PAGE_SIZE,
} from '../reports.constants.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query de GET /admin/reportes/morosidad (H32). El rango filtra por la fecha
 * de vencimiento de la cuota; sin valores, son los últimos 12 meses hasta
 * hoy. Que el fin no sea anterior al inicio y el máximo de 366 días los
 * valida el servicio.
 */
export class DelinquencyQueryDto {
  @ApiPropertyOptional({
    example: '2025-11-07',
    description: 'AAAA-MM-DD. Por defecto, `to` menos 12 meses.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: DELINQUENCY_MESSAGES.dateFormat })
  @IsISO8601({ strict: true }, { message: DELINQUENCY_MESSAGES.dateFormat })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-07',
    description: 'AAAA-MM-DD. Por defecto, hoy en el condominio.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: DELINQUENCY_MESSAGES.dateFormat })
  @IsISO8601({ strict: true }, { message: DELINQUENCY_MESSAGES.dateFormat })
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: DELINQUENCY_MESSAGES.page })
  @Min(1, { message: DELINQUENCY_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: DELINQUENCY_MAX_PAGE_SIZE,
    default: DELINQUENCY_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: DELINQUENCY_MESSAGES.pageSize })
  @Min(1, { message: DELINQUENCY_MESSAGES.pageSize })
  @Max(DELINQUENCY_MAX_PAGE_SIZE, { message: DELINQUENCY_MESSAGES.pageSize })
  pageSize: number = DELINQUENCY_PAGE_SIZE;
}
