import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  CreateVisitDto,
  MyVisitListDto,
  MyVisitsQueryDto,
  VisitAnsweredDto,
  VisitCancelledDto,
  VisitCreatedDto,
  VisitResponseDto,
} from './dto/index.js';
import { ResidentVisitsService } from './resident-visits.service.js';
import { VisitsService } from './visits.service.js';

/** Control de acceso de visitas (Módulo 4). */
@ApiTags('visitas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@Controller('visitas')
export class VisitsController {
  constructor(
    private readonly visits: VisitsService,
    private readonly residentVisits: ResidentVisitsService,
  ) {}

  /** H14: el residente autoriza a un visitante antes de que llegue. */
  @Post()
  @Roles('RESIDENTE')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Preautoriza un visitante (H14)' })
  @ApiCreatedResponse({ type: VisitCreatedDto })
  @ApiBadRequestResponse({
    description:
      'Campo inválido: fecha fuera de hoy a hoy + 30 días, hora fuera de 06:00 a 22:00 o ya pasada, documento con formato distinto al de su tipo… `field` indica cuál.',
  })
  @ApiForbiddenResponse({ description: 'Solo el Residente.' })
  @ApiConflictResponse({
    description: 'Este visitante ya tiene una autorización para esa fecha.',
  })
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateVisitDto,
  ): Promise<VisitCreatedDto> {
    return this.visits.create(user, dto);
  }

  /** H15: visitas de la unidad, en las pestañas Activas e Historial. */
  @Get('mias')
  @Roles('RESIDENTE')
  @ApiOperation({ summary: 'Visitas de la unidad del residente (H15)' })
  @ApiOkResponse({ type: MyVisitListDto })
  @ApiBadRequestResponse({ description: 'Pestaña o paginación inválidas.' })
  listMine(
    @CurrentUser() user: User,
    @Query() query: MyVisitsQueryDto,
  ): Promise<MyVisitListDto> {
    return this.residentVisits.list(user, query);
  }

  /** H15: cancela una autorización de la unidad. */
  @Patch(':id/cancelar')
  @Roles('RESIDENTE')
  @ApiOperation({ summary: 'Cancela una visita Autorizada (H15)' })
  @ApiOkResponse({ type: VisitCancelledDto })
  @ApiNotFoundResponse({ description: 'No existe o es de otra unidad.' })
  @ApiConflictResponse({ description: 'La visita no está Autorizada.' })
  cancel(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VisitCancelledDto> {
    return this.residentVisits.cancel(user, id);
  }

  /** H15: aprueba o rechaza una solicitud de portería (H16). */
  @Post(':id/respuesta')
  @Roles('RESIDENTE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Responde una solicitud de portería (H15)' })
  @ApiOkResponse({ type: VisitAnsweredDto })
  @ApiNotFoundResponse({ description: 'No existe o es de otra unidad.' })
  @ApiConflictResponse({
    description: 'Ya respondida por otro residente, vencida o no pendiente.',
  })
  respond(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VisitResponseDto,
  ): Promise<VisitAnsweredDto> {
    return this.residentVisits.respond(user, id, dto);
  }
}
