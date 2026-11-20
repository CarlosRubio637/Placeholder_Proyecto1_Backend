import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { AreasUsageService } from './areas-usage.service.js';
import { DelinquencyService } from './delinquency.service.js';
import { AreasUsageQueryDto } from './dto/areas-usage-query.dto.js';
import { AreasUsageReportDto } from './dto/areas-usage-response.dto.js';
import { DelinquencyQueryDto } from './dto/delinquency-query.dto.js';
import { DelinquencyReportDto } from './dto/delinquency-response.dto.js';
import { ParticipationReportQueryDto } from './dto/participation-report-query.dto.js';
import { ParticipationReportDto } from './dto/participation-report-response.dto.js';
import { IncidentsReportQueryDto } from './dto/incidents-report-query.dto.js';
import { IncidentsReportDto } from './dto/incidents-report-response.dto.js';
import { IncidentsReportService } from './incidents-report.service.js';
import { ParticipationReportService } from './participation-report.service.js';
import { AdminSummaryDto } from './dto/summary-response.dto.js';
import { SummaryService } from './summary.service.js';

/** Reportes para la administración (Módulo 10). */
@ApiTags('reportes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Administrador.' })
@Controller('admin/reportes')
@Roles('ADMINISTRADOR')
export class ReportsController {
  constructor(
    private readonly delinquency: DelinquencyService,
    private readonly incidents: IncidentsReportService,
    private readonly areas: AreasUsageService,
    private readonly participation: ParticipationReportService,
    private readonly summary: SummaryService,
  ) {}

  @Get('resumen')
  @ApiOperation({
    summary: 'Resumen "de un vistazo": las cuatro tarjetas (H37)',
  })
  @ApiOkResponse({ type: AdminSummaryDto })
  getSummary(): Promise<AdminSummaryDto> {
    return this.summary.getSummary();
  }

  @Get('morosidad')
  @ApiOperation({ summary: 'Panel de morosidad (H32)' })
  @ApiOkResponse({ type: DelinquencyReportDto })
  @ApiBadRequestResponse({
    description:
      'Fecha inválida, fin anterior al inicio, rango de más de 366 días o paginación inválida. `field` indica cuál.',
  })
  getDelinquency(
    @Query() query: DelinquencyQueryDto,
  ): Promise<DelinquencyReportDto> {
    return this.delinquency.getReport(query);
  }

  @Get('incidencias')
  @ApiOperation({ summary: 'Reporte de incidencias abiertas (H34)' })
  @ApiOkResponse({ type: IncidentsReportDto })
  @ApiBadRequestResponse({
    description:
      'Fecha inválida, fin anterior al inicio, rango de más de 366 días o paginación inválida. `field` indica cuál.',
  })
  getIncidents(
    @Query() query: IncidentsReportQueryDto,
  ): Promise<IncidentsReportDto> {
    return this.incidents.getReport(query);
  }

  @Get('areas')
  @ApiOperation({ summary: 'Reporte de uso de áreas comunes (H33)' })
  @ApiOkResponse({ type: AreasUsageReportDto })
  @ApiBadRequestResponse({
    description:
      'Fecha inválida, fin anterior al inicio o rango de más de 366 días. `field` indica cuál.',
  })
  getAreas(@Query() query: AreasUsageQueryDto): Promise<AreasUsageReportDto> {
    return this.areas.getReport(query);
  }

  @Get('participacion')
  @ApiOperation({ summary: 'Reporte de participación en votaciones (H35)' })
  @ApiOkResponse({ type: ParticipationReportDto })
  @ApiBadRequestResponse({
    description:
      'Asamblea o fecha inválida, fin anterior al inicio, rango de más de 366 días o paginación inválida. `field` indica cuál.',
  })
  getParticipation(
    @Query() query: ParticipationReportQueryDto,
  ): Promise<ParticipationReportDto> {
    return this.participation.getReport(query);
  }
}
