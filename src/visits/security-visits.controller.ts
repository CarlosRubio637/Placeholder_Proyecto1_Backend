import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  CreateVisitRequestDto,
  SearchVisitsQueryDto,
  SecurityVisitListDto,
  VisitEntryDto,
  VisitExitDto,
  VisitRequestCreatedDto,
  VisitRequestListDto,
} from './dto/index.js';
import { SecurityVisitsService } from './security-visits.service.js';

/** Portería: entradas (H16) y salidas (H17) de visitantes. Solo el Personal de seguridad. */
@ApiTags('visitas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Personal de seguridad.' })
@Roles('SEGURIDAD')
@Controller('seguridad/visitas')
export class SecurityVisitsController {
  constructor(private readonly visits: SecurityVisitsService) {}

  @Get('buscar')
  @ApiOperation({
    summary: 'Busca visitas de hoy por código o documento (H16)',
  })
  @ApiOkResponse({ type: SecurityVisitListDto })
  @ApiBadRequestResponse({ description: 'Búsqueda vacía o mal formada.' })
  search(@Query() query: SearchVisitsQueryDto): Promise<SecurityVisitListDto> {
    return this.visits.search(query.q);
  }

  @Post('solicitudes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Solicita autorización para un visitante sin aviso (H16)',
  })
  @ApiCreatedResponse({ type: VisitRequestCreatedDto })
  @ApiBadRequestResponse({ description: '`field` indica el campo que falló.' })
  @ApiNotFoundResponse({ description: 'La unidad no existe.' })
  @ApiConflictResponse({
    description:
      'Unidad sin residentes, visitante ya dentro o fuera del horario de visitas.',
  })
  createRequest(
    @CurrentUser() user: User,
    @Body() dto: CreateVisitRequestDto,
  ): Promise<VisitRequestCreatedDto> {
    return this.visits.createRequest(user, dto);
  }

  @Get('solicitudes')
  @ApiOperation({
    summary: 'Solicitudes de hoy, la más reciente primero (H16)',
  })
  @ApiOkResponse({ type: VisitRequestListDto })
  listRequests(): Promise<VisitRequestListDto> {
    return this.visits.listRequests();
  }

  @Post(':id/entrada')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra la entrada de una visita (H16)' })
  @ApiOkResponse({ type: VisitEntryDto })
  @ApiNotFoundResponse({ description: 'La visita no existe.' })
  @ApiConflictResponse({
    description:
      'Fuera de vigencia, estado distinto de Autorizada (con `status`) o visitante ya dentro.',
  })
  registerEntry(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VisitEntryDto> {
    return this.visits.registerEntry(user, id);
  }

  @Post(':id/salida')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra la salida de un visitante (H17)' })
  @ApiOkResponse({ type: VisitExitDto })
  @ApiNotFoundResponse({ description: 'La visita no existe.' })
  @ApiConflictResponse({
    description:
      'La visita no está Dentro: "Este visitante no tiene una entrada activa."',
  })
  registerExit(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<VisitExitDto> {
    return this.visits.registerExit(user, id);
  }
}
