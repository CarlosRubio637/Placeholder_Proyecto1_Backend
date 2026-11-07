import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  FeeGenerationDto,
  FeeGenerationPreviewDto,
  FeeGenerationPreviewQueryDto,
  FeeGenerationsPageDto,
  FeeGenerationsPageQueryDto,
  GenerateFeesDto,
} from '../dto/index.js';
import { FeeGenerationsService } from '../services/index.js';

@ApiTags('cuotas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({
  description: 'Solo el Administrador genera y consulta generaciones.',
})
@Roles('ADMINISTRADOR')
@Controller('cuotas/generaciones')
export class FeeGenerationsController {
  constructor(private readonly feeGenerations: FeeGenerationsService) {}

  @Get('vista-previa')
  @ApiOperation({
    summary: 'Unidades activas y cuántas recibirían cuota en el periodo (H3)',
  })
  @ApiOkResponse({ type: FeeGenerationPreviewDto })
  @ApiBadRequestResponse({
    description: 'Periodo inválido o fuera de la ventana. `field` es period.',
  })
  preview(
    @Query() query: FeeGenerationPreviewQueryDto,
  ): Promise<FeeGenerationPreviewDto> {
    return this.feeGenerations.preview(query.period);
  }

  @Post()
  @ApiOperation({
    summary: 'Genera las cuotas del periodo para las unidades activas (H3)',
  })
  @ApiCreatedResponse({ type: FeeGenerationDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos. `field` indica el campo que falló.',
  })
  @ApiConflictResponse({
    description:
      'No hay unidades activas o todas ya tienen cuota de ese periodo.',
  })
  generate(
    @CurrentUser() admin: User,
    @Body() dto: GenerateFeesDto,
  ): Promise<FeeGenerationDto> {
    return this.feeGenerations.generate(admin, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Historial de generaciones, más reciente primero (H3)',
  })
  @ApiOkResponse({ type: FeeGenerationsPageDto })
  @ApiBadRequestResponse({ description: 'page o pageSize inválidos.' })
  list(
    @Query() query: FeeGenerationsPageQueryDto,
  ): Promise<FeeGenerationsPageDto> {
    return this.feeGenerations.list(query);
  }
}
