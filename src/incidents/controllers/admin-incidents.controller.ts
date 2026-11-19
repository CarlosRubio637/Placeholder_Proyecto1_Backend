import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  AdminIncidentListDto,
  AdminIncidentsQuery,
  IncidentManagementDto,
  MaintenanceStaffListDto,
  UpdateIncidentDto,
} from '../dto/index.js';
import { AdminIncidentsService } from '../services/index.js';

/** H12: bandeja de incidencias del administrador. */
@ApiTags('incidencias')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Administrador.' })
@Roles('ADMINISTRADOR')
@Controller('admin')
export class AdminIncidentsController {
  constructor(private readonly incidents: AdminIncidentsService) {}

  @Get('incidencias')
  @ApiOperation({
    summary: 'Todas las incidencias, por prioridad y antigüedad (H12)',
  })
  @ApiOkResponse({ type: AdminIncidentListDto })
  @ApiBadRequestResponse({ description: '`field` indica el filtro inválido.' })
  list(@Query() query: AdminIncidentsQuery): Promise<AdminIncidentListDto> {
    return this.incidents.list(query);
  }

  @Get('responsables')
  @ApiOperation({ summary: 'Responsables de mantenimiento activos (H12)' })
  @ApiOkResponse({ type: MaintenanceStaffListDto })
  staff(): Promise<MaintenanceStaffListDto> {
    return this.incidents.staff();
  }

  @Patch('incidencias/:id')
  @ApiOperation({ summary: 'Cambia la prioridad o el responsable (H12)' })
  @ApiOkResponse({ type: IncidentManagementDto })
  @ApiBadRequestResponse({
    description:
      'Sin cambios, prioridad inválida o responsable inexistente o inactivo.',
  })
  @ApiNotFoundResponse({ description: 'La incidencia no existe.' })
  @ApiConflictResponse({ description: 'La incidencia está resuelta.' })
  update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateIncidentDto,
  ): Promise<IncidentManagementDto> {
    return this.incidents.update(user, id, dto);
  }
}
