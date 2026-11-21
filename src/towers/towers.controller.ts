import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { TowersService } from './towers.service.js';
import { TowerResponseDto } from './dto/index.js';

@ApiTags('torres')
@ApiBearerAuth()
@Controller('torres')
@Roles('ADMINISTRADOR', 'SEGURIDAD', 'RESIDENTE')
export class TowersController {
  constructor(private readonly towersService: TowersService) {}

  @Get()
  @ApiOperation({ summary: 'Devuelve las torres del condominio (H19 y H29)' })
  @ApiOkResponse({ type: [TowerResponseDto] })
  async findAll(): Promise<TowerResponseDto[]> {
    return this.towersService.findAll();
  }
}
