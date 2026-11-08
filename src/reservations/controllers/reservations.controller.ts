import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
  AvailabilityDto,
  AvailabilityQueryDto,
  CreateReservationDto,
  PublicAreaListDto,
  ReservationDto,
} from '../dto/index.js';
import { ReservationsService } from '../services/index.js';

/** Catálogo de áreas habilitadas (lo usan H6 y H7). */
@ApiTags('áreas comunes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'El Personal de seguridad no consulta áreas.' })
@Roles('RESIDENTE', 'ADMINISTRADOR')
@Controller('areas')
export class AreasController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista las áreas habilitadas, por nombre (H6, H7)' })
  @ApiOkResponse({ type: PublicAreaListDto })
  list(): Promise<PublicAreaListDto> {
    return this.reservations.listAreas();
  }

  @Get(':areaId/disponibilidad')
  @ApiOperation({ summary: 'Franjas de un área en una fecha con su estado (H6)' })
  @ApiOkResponse({ type: AvailabilityDto })
  @ApiBadRequestResponse({ description: 'Fecha inválida o fuera del rango de hoy a 30 días.' })
  @ApiNotFoundResponse({ description: 'El área no existe o está deshabilitada.' })
  availability(
    @CurrentUser() user: User,
    @Param('areaId', new ParseUUIDPipe()) areaId: string,
    @Query() query: AvailabilityQueryDto,
  ): Promise<AvailabilityDto> {
    return this.reservations.availability(user, areaId, query.date);
  }
}

/** H7: reserva de un área común. */
@ApiTags('reservas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo un Residente reserva.' })
@Roles('RESIDENTE')
@Controller('reservas')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Reserva una franja para la unidad del residente (H7)' })
  @ApiCreatedResponse({ type: ReservationDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos, fecha u hora pasada, franja fuera del horario o aforo excedido. `field` indica el campo.',
  })
  @ApiNotFoundResponse({ description: 'El área no existe.' })
  @ApiConflictResponse({
    description: 'Franja ya reservada, área deshabilitada o bloqueada, o la unidad ya tiene 2 reservas activas.',
  })
  create(@CurrentUser() user: User, @Body() dto: CreateReservationDto): Promise<ReservationDto> {
    return this.reservations.create(user, dto);
  }
}
