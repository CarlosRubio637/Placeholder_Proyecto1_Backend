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
import { DelinquencyService } from './delinquency.service.js';
import { DelinquencyQueryDto } from './dto/delinquency-query.dto.js';
import { DelinquencyReportDto } from './dto/delinquency-response.dto.js';
import { IncidentsReportQueryDto } from './dto/incidents-report-query.dto.js';
import { IncidentsReportDto } from './dto/incidents-report-response.dto.js';
import { IncidentsReportService } from './incidents-report.service.js';

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
  ) {}

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
}
