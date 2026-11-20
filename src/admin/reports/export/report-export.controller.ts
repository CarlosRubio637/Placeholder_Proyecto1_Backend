import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  AreasUsageExportQueryDto,
  DelinquencyExportQueryDto,
  IncidentsReportExportQueryDto,
  ParticipationExportQueryDto,
} from '../dto/report-export-query.dto.js';
import { EXPORT_CONTENT_TYPES } from './export.constants.js';
import { ReportExportService } from './report-export.service.js';

/**
 * Exportación de los reportes a PDF o CSV (H36). Una ruta por reporte, cada
 * una con los filtros de su reporte; un reporte que no existe responde 404.
 */
@ApiTags('reportes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Administrador.' })
@ApiProduces(EXPORT_CONTENT_TYPES.pdf, EXPORT_CONTENT_TYPES.csv)
@ApiResponse({
  status: 200,
  description:
    'El archivo, con `Content-Disposition: attachment; filename=<reporte>_<desde>_<hasta>.<pdf|csv>`.',
})
@ApiBadRequestResponse({
  description:
    'Formato distinto de pdf o csv, filtros inválidos o más de 5,000 filas. `field` indica cuál.',
})
@Controller('admin/reportes')
@Roles('ADMINISTRADOR')
export class ReportExportController {
  constructor(private readonly exporter: ReportExportService) {}

  @Get('morosidad/exportar')
  @ApiOperation({ summary: 'Exporta el panel de morosidad (H32 → H36)' })
  async delinquency(
    @Query() query: DelinquencyExportQueryDto,
    @CurrentUser() user: User,
  ): Promise<StreamableFile> {
    const table = await this.exporter.delinquencyTable(query);
    return this.exporter.toFile(table, query.format, user);
  }

  @Get('areas/exportar')
  @ApiOperation({ summary: 'Exporta el uso de áreas comunes (H33 → H36)' })
  async areas(
    @Query() query: AreasUsageExportQueryDto,
    @CurrentUser() user: User,
  ): Promise<StreamableFile> {
    const table = await this.exporter.areasTable(query);
    return this.exporter.toFile(table, query.format, user);
  }

  @Get('incidencias/exportar')
  @ApiOperation({ summary: 'Exporta el reporte de incidencias (H34 → H36)' })
  async incidents(
    @Query() query: IncidentsReportExportQueryDto,
    @CurrentUser() user: User,
  ): Promise<StreamableFile> {
    const table = await this.exporter.incidentsTable(query);
    return this.exporter.toFile(table, query.format, user);
  }

  @Get('participacion/exportar')
  @ApiOperation({
    summary: 'Exporta la participación en votaciones (H35 → H36)',
  })
  async participation(
    @Query() query: ParticipationExportQueryDto,
    @CurrentUser() user: User,
  ): Promise<StreamableFile> {
    const table = await this.exporter.participationTable(query);
    return this.exporter.toFile(table, query.format, user);
  }
}
