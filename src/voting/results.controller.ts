import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '@Auth/decorators';
import { ParticipationQueryDto } from './dto/index.js';
import { ResultsService } from './results.service.js';

/**
 * Resultado de la asamblea (H24). Lo ven el Administrador y el Residente;
 * el Personal de seguridad recibe 403.
 */
@ApiTags('asambleas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({ description: 'Solo el Administrador y el Residente.' })
@Controller('asambleas')
@Roles('ADMINISTRADOR', 'RESIDENTE')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get(':id/resultado')
  @ApiOperation({ summary: 'Resultado auditable de la asamblea (H24)' })
  @ApiOkResponse({
    description:
      'Unidades habilitadas y que votaron por tema. Con la asamblea Cerrada incluye votos y % por opción, la ganadora y si hubo empate (guardados al cierre). Mientras no está Cerrada, `totalVotes`, `votes` y `pct` vienen en null.',
  })
  @ApiBadRequestResponse({ description: 'El id no es un UUID.' })
  @ApiNotFoundResponse({ description: 'La asamblea no existe.' })
  getResult(@Param('id', ParseUUIDPipe) id: string) {
    return this.resultsService.getResult(id);
  }

  @Get('temas/:temaId/participacion')
  @ApiOperation({ summary: 'Registro de participación de un tema (H24)' })
  @ApiOkResponse({
    description:
      'Unidades que votaron el tema y a qué hora, por código de unidad, sin la opción elegida. 50 por página por defecto.',
  })
  @ApiBadRequestResponse({
    description:
      'El id no es un UUID o la paginación es inválida. `field` indica cuál.',
  })
  @ApiNotFoundResponse({ description: 'El tema no existe.' })
  getParticipation(
    @Param('temaId', ParseUUIDPipe) temaId: string,
    @Query() query: ParticipationQueryDto,
  ) {
    return this.resultsService.getParticipation(temaId, query);
  }
}
