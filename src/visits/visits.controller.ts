import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { CreateVisitDto, VisitCreatedDto } from './dto/index.js';
import { VisitsService } from './visits.service.js';

/** Control de acceso de visitas (Módulo 4). */
@ApiTags('visitas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@Controller('visitas')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

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
}
