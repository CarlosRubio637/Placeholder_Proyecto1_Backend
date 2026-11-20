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
import { OverdueUnitsQueryDto } from './dto/overdue-units-query.dto.js';
import { OverdueUnitsReportDto } from './dto/overdue-units-response.dto.js';
import { OverdueUnitsService } from './overdue-units.service.js';

@ApiTags('cuotas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Administrador.' })
@Roles('ADMINISTRADOR')
@Controller('morosidad')
export class OverdueUnitsController {
  constructor(private readonly overdueUnits: OverdueUnitsService) {}

  @Get()
  @ApiOperation({ summary: 'Reporte de unidades morosas (H4)' })
  @ApiOkResponse({ type: OverdueUnitsReportDto })
  @ApiBadRequestResponse({
    description:
      'towerId, search, page o pageSize inválidos. `field` indica cuál.',
  })
  getReport(
    @Query() query: OverdueUnitsQueryDto,
  ): Promise<OverdueUnitsReportDto> {
    return this.overdueUnits.getReport(query);
  }
}
