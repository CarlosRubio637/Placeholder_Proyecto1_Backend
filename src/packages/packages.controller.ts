import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
  CreatePackageDto,
  ListPackagesQueryDto,
  PackageListDto,
  PackageResponseDto,
} from './dto/index.js';
import { PackagesService } from './packages.service.js';

@ApiTags('paquetes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({
  description: 'Solo el personal de seguridad puede usar esta ruta.',
})
@Controller('seguridad/paquetes')
@Roles('SEGURIDAD')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  /** H19: seguridad registra la llegada de un paquete para una unidad. */
  @Post()
  @ApiOperation({ summary: 'Registra la llegada de un paquete (H19)' })
  @ApiCreatedResponse({ type: PackageResponseDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos. `field` indica el campo que falló.',
  })
  @ApiNotFoundResponse({ description: 'La unidad no existe.' })
  @ApiConflictResponse({ description: 'La unidad no tiene residentes registrados.' })
  create(
    @CurrentUser() user: User,
    @Body() dto: CreatePackageDto,
  ): Promise<PackageResponseDto> {
    return this.packagesService.create(user, dto);
  }

  /** H19: paquetes, del más reciente al más antiguo (20 por página). */
  @Get()
  @ApiOperation({ summary: 'Lista los paquetes registrados (H19)' })
  @ApiOkResponse({ type: PackageListDto })
  @ApiBadRequestResponse({ description: 'Filtros inválidos.' })
  list(@Query() query: ListPackagesQueryDto): Promise<PackageListDto> {
    return this.packagesService.list(query);
  }
}
