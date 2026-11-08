import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser, Roles } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { CastVoteDto } from './dto/index.js';
import { VotingService } from './voting.service.js';

@Controller('asambleas')
@Roles('RESIDENTE')
export class VotingController {
  constructor(private readonly votingService: VotingService) {}

  /** H23: asambleas Abiertas en las que la unidad puede votar. */
  @Get('activas')
  findActive(@CurrentUser() user: User) {
    return this.votingService.findActive(user);
  }

  /** H23: detalle de una asamblea con el estado de voto de la unidad. */
  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.votingService.findOne(user, id);
  }

  /** H23: registra el voto de la unidad en un tema. */
  @Post('temas/:temaId/votos')
  @HttpCode(201)
  vote(
    @CurrentUser() user: User,
    @Param('temaId', ParseUUIDPipe) temaId: string,
    @Body() dto: CastVoteDto,
  ) {
    return this.votingService.vote(user, temaId, dto);
  }
}
