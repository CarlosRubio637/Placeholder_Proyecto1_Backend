import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  AreaDto,
  AreaListDto,
  AreaUpdatedDto,
  BlockCreatedDto,
  CreateAreaDto,
  CreateBlockDto,
  UpdateAreaDto,
} from '../dto/index.js';
import { AreasService } from '../services/index.js';

const AFFECTED =
  '409 RESERVAS_AFECTADAS con `affectedCount` si el cambio cancela reservas confirmadas y no llegó `confirmCancellations: true`.';

/** H9: administración de áreas comunes, horarios y bloqueos. */
@ApiTags('admin · áreas comunes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Administrador administra áreas.' })
@Roles('ADMINISTRADOR')
@Controller('admin/areas')
export class AdminAreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las áreas con reservas futuras y bloqueos (H9)' })
  @ApiOkResponse({ type: AreaListDto })
  list(): Promise<AreaListDto> {
    return this.areas.list();
  }

  @Post()
  @ApiOperation({ summary: 'Crea un área común (H9)' })
  @ApiCreatedResponse({ type: AreaDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos. `field` indica el campo que falló.' })
  @ApiConflictResponse({ description: 'Ya existe un área con ese nombre.' })
  create(@CurrentUser() user: User, @Body() dto: CreateAreaDto): Promise<AreaDto> {
    return this.areas.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un área; puede cancelar reservas futuras (H9)' })
  @ApiOkResponse({ type: AreaUpdatedDto })
  @ApiBadRequestResponse({ description: 'Datos inválidos. `field` indica el campo que falló.' })
  @ApiNotFoundResponse({ description: 'El área no existe.' })
  @ApiConflictResponse({ description: `Nombre duplicado, o ${AFFECTED}` })
  update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAreaDto,
  ): Promise<AreaUpdatedDto> {
    return this.areas.update(user, id, dto);
  }

  @Post(':id/bloqueos')
  @ApiOperation({ summary: 'Bloquea el área por mantenimiento (H9)' })
  @ApiCreatedResponse({ type: BlockCreatedDto })
  @ApiBadRequestResponse({ description: 'Fechas o motivo inválidos. `field` indica el campo.' })
  @ApiNotFoundResponse({ description: 'El área no existe.' })
  @ApiConflictResponse({ description: AFFECTED })
  createBlock(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBlockDto,
  ): Promise<BlockCreatedDto> {
    return this.areas.createBlock(user, id, dto);
  }

  @Delete(':id/bloqueos/:bloqueoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina un bloqueo; no restaura reservas (H9)' })
  @ApiNoContentResponse({ description: 'Bloqueo eliminado.' })
  @ApiNotFoundResponse({ description: 'El bloqueo no existe.' })
  deleteBlock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('bloqueoId', new ParseUUIDPipe()) blockId: string,
  ): Promise<void> {
    return this.areas.deleteBlock(id, blockId);
  }
}
