import { ApiProperty, IntersectionType, OmitType } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  EXPORT_FORMATS,
  EXPORT_MESSAGES,
  type ExportFormat,
} from '../export/export.constants.js';
import { AreasUsageQueryDto } from './areas-usage-query.dto.js';
import { DelinquencyQueryDto } from './delinquency-query.dto.js';
import { IncidentsReportQueryDto } from './incidents-report-query.dto.js';
import { ParticipationReportQueryDto } from './participation-report-query.dto.js';

/** `format` de GET /admin/reportes/:reporte/exportar (H36). */
export class ExportFormatDto {
  @ApiProperty({ enum: EXPORT_FORMATS })
  @IsIn(EXPORT_FORMATS, { message: EXPORT_MESSAGES.format })
  format!: ExportFormat;
}

// Cada exportación acepta los mismos filtros que su reporte, sin la
// paginación: el archivo lleva la tabla completa.

export class DelinquencyExportQueryDto extends IntersectionType(
  OmitType(DelinquencyQueryDto, ['page', 'pageSize'] as const),
  ExportFormatDto,
) {}

export class AreasUsageExportQueryDto extends IntersectionType(
  AreasUsageQueryDto,
  ExportFormatDto,
) {}

export class IncidentsReportExportQueryDto extends IntersectionType(
  OmitType(IncidentsReportQueryDto, ['page', 'pageSize'] as const),
  ExportFormatDto,
) {}

export class ParticipationExportQueryDto extends IntersectionType(
  OmitType(ParticipationReportQueryDto, ['page', 'pageSize'] as const),
  ExportFormatDto,
) {}
