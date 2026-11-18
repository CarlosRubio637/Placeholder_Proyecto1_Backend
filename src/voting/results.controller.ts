import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Roles } from '@Auth/decorators';
import { ParticipationQueryDto } from './dto/index.js';
import { ResultsService } from './results.service.js';

/**
 * Resultado de la asamblea (H24). Lo ven el Administrador y el Residente;
 * el Personal de seguridad recibe 403.
 */
@Controller('asambleas')
@Roles('ADMINISTRADOR', 'RESIDENTE')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get(':id/resultado')
  getResult(@Param('id', ParseUUIDPipe) id: string) {
    return this.resultsService.getResult(id);
  }

  @Get('temas/:temaId/participacion')
  getParticipation(
    @Param('temaId', ParseUUIDPipe) temaId: string,
    @Query() query: ParticipationQueryDto,
  ) {
    return this.resultsService.getParticipation(temaId, query);
  }
}
