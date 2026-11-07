import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UnitsService } from './units.service.js';
import { Roles } from '@Auth/decorators';
import { UnitResponseDto } from './dto/index.js';

@ApiTags('unidades')
@ApiBearerAuth()
@Controller('unidades')
// Se asume que ADMINISTRADOR y SEGURIDAD pueden consultar las unidades.
@Roles('ADMINISTRADOR', 'SEGURIDAD')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({ summary: 'Devuelve la lista de unidades de una torre específica (H16/H19)' })
  @ApiQuery({
    name: 'towerId',
    required: true,
    description: 'UUID de la torre',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOkResponse({ type: [UnitResponseDto] })
  async findByTower(
    @Query('towerId', new ParseUUIDPipe()) towerId: string,
  ): Promise<UnitResponseDto[]> {
    return this.unitsService.findByTower(towerId);
  }
}