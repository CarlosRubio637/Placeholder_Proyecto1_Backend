import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
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
  DeliverPackageDto,
  DeliveredPackageDto,
  ListPackagesQueryDto,
  MyPackagesListDto,
  MyPackagesQueryDto,
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

  /** H21: seguridad registra a quién entrega el paquete. */
  @Post(':id/entrega')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registra la entrega de un paquete (H21)' })
  @ApiOkResponse({ type: DeliveredPackageDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos. `field` indica el campo que falló.',
  })
  @ApiNotFoundResponse({ description: 'El paquete no existe.' })
  @ApiConflictResponse({ description: 'El paquete ya fue entregado.' })
  deliver(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeliverPackageDto,
  ): Promise<DeliveredPackageDto> {
    return this.packagesService.deliver(user, id, dto);
  }
}

@ApiTags('paquetes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({
  description: 'Solo los residentes pueden ver sus propios paquetes.',
})
@Controller('paquetes/mios')
@Roles('RESIDENTE')
export class MyPackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  /**
   * H20: el residente consulta los paquetes de su unidad. La unidad sale del
   * token; un `unitId` en la consulta se rechaza con 400 (forbidNonWhitelisted).
   */
  @Get()
  @ApiOperation({ summary: 'Lista los paquetes de la unidad del residente (H20)' })
  @ApiOkResponse({ type: MyPackagesListDto })
  @ApiBadRequestResponse({
    description: 'Filtros inválidos (incluye enviar `unitId`).',
  })
  listMine(
    @CurrentUser() user: User,
    @Query() query: MyPackagesQueryDto,
  ): Promise<MyPackagesListDto> {
    return this.packagesService.listMine(user, query);
  }
}
