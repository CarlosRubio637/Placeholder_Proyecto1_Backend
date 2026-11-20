import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  PARTICIPATION_MAX_PAGE_SIZE,
  PARTICIPATION_MESSAGES,
  PARTICIPATION_PAGE_SIZE,
} from '../participation-report.constants.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query de GET /admin/reportes/participacion (H35). Con `assemblyId` el
 * reporte trae solo esa asamblea y no aplica las fechas. Sin fechas, el
 * periodo de apertura va de hoy − 12 meses a hoy. Que el fin no sea anterior
 * al inicio y el máximo de 366 días los valida el servicio.
 */
export class ParticipationReportQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Una sola asamblea. Si viene, no se aplican las fechas.',
  })
  @IsOptional()
  @IsUUID('all', { message: PARTICIPATION_MESSAGES.assemblyId })
  assemblyId?: string;

  @ApiPropertyOptional({
    example: '2025-11-19',
    description: 'Apertura desde, AAAA-MM-DD. Por defecto, hoy − 12 meses.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: PARTICIPATION_MESSAGES.dateFormat })
  @IsISO8601({ strict: true }, { message: PARTICIPATION_MESSAGES.dateFormat })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-19',
    description:
      'Apertura hasta, AAAA-MM-DD. Por defecto, hoy en el condominio.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: PARTICIPATION_MESSAGES.dateFormat })
  @IsISO8601({ strict: true }, { message: PARTICIPATION_MESSAGES.dateFormat })
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PARTICIPATION_MESSAGES.page })
  @Min(1, { message: PARTICIPATION_MESSAGES.page })
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PARTICIPATION_MAX_PAGE_SIZE,
    default: PARTICIPATION_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: PARTICIPATION_MESSAGES.pageSize })
  @Min(1, { message: PARTICIPATION_MESSAGES.pageSize })
  @Max(PARTICIPATION_MAX_PAGE_SIZE, {
    message: PARTICIPATION_MESSAGES.pageSize,
  })
  pageSize: number = PARTICIPATION_PAGE_SIZE;
}
