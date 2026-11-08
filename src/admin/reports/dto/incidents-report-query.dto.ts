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
  INCIDENTS_REPORT_MAX_PAGE_SIZE,
  INCIDENTS_REPORT_MESSAGES,
  INCIDENTS_REPORT_PAGE_SIZE,
} from '../incidents-report.constants.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query de GET /admin/reportes/incidencias (H34). Sin fechas, el periodo es
 * el mes actual: del día 1 hasta hoy. Que el fin no sea anterior al inicio y
 * el máximo de 366 días los valida el servicio. `page` y `pageSize` paginan
 * solo la lista de abiertas con más de 7 días.
 */
export class IncidentsReportQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'AAAA-MM-DD. Por defecto, el día 1 del mes actual.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: INCIDENTS_REPORT_MESSAGES.dateFormat })
  @IsISO8601(
    { strict: true },
    { message: INCIDENTS_REPORT_MESSAGES.dateFormat },
  )
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-08',
    description: 'AAAA-MM-DD. Por defecto, hoy en el condominio.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: INCIDENTS_REPORT_MESSAGES.dateFormat })
  @IsISO8601(
    { strict: true },
    { message: INCIDENTS_REPORT_MESSAGES.dateFormat },
  )
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INCIDENTS_REPORT_MESSAGES.page })
  @Min(1, { message: INCIDENTS_REPORT_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: INCIDENTS_REPORT_MAX_PAGE_SIZE,
    default: INCIDENTS_REPORT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: INCIDENTS_REPORT_MESSAGES.pageSize })
  @Min(1, { message: INCIDENTS_REPORT_MESSAGES.pageSize })
  @Max(INCIDENTS_REPORT_MAX_PAGE_SIZE, {
    message: INCIDENTS_REPORT_MESSAGES.pageSize,
  })
  pageSize: number = INCIDENTS_REPORT_PAGE_SIZE;
}
