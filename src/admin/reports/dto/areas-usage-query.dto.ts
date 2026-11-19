import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';
import { AREAS_USAGE_MESSAGES } from '../areas-usage.constants.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query de GET /admin/reportes/areas (H33). Sin fechas, el periodo es el mes
 * actual: del día 1 hasta hoy. Que el fin no sea anterior al inicio y el
 * máximo de 366 días los valida el servicio.
 */
export class AreasUsageQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'AAAA-MM-DD. Por defecto, el día 1 del mes actual.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: AREAS_USAGE_MESSAGES.dateFormat })
  @IsISO8601({ strict: true }, { message: AREAS_USAGE_MESSAGES.dateFormat })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-19',
    description: 'AAAA-MM-DD. Por defecto, hoy en el condominio.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: AREAS_USAGE_MESSAGES.dateFormat })
  @IsISO8601({ strict: true }, { message: AREAS_USAGE_MESSAGES.dateFormat })
  to?: string;
}
