import {
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
  ResidentAnnouncementDto,
  ResidentAnnouncementPageDto,
  ResidentAnnouncementsQueryDto,
} from '../dto/index.js';
import { ResidentAnnouncementsService } from '../services/index.js';

@ApiTags('comunicados')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({
  description: 'Solo el Residente consulta sus comunicados.',
})
@Roles('RESIDENTE')
@Controller('comunicados')
export class ResidentAnnouncementsController {
  constructor(private readonly announcements: ResidentAnnouncementsService) {}

  @Get()
  @ApiOperation({
    summary: 'Comunicados de los que el residente es destinatario (H27)',
  })
  @ApiOkResponse({ type: ResidentAnnouncementPageDto })
  @ApiBadRequestResponse({
    description:
      'Pestaña, categoría o paginación inválidas. `field` indica cuál.',
  })
  list(
    @CurrentUser() user: User,
    @Query() query: ResidentAnnouncementsQueryDto,
  ): Promise<ResidentAnnouncementPageDto> {
    return this.announcements.list(user, query);
  }

  @Post(':id/lectura')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Abre el comunicado y guarda la primera lectura del residente (H27)',
  })
  @ApiOkResponse({ type: ResidentAnnouncementDto })
  @ApiBadRequestResponse({ description: 'El id no es un uuid.' })
  @ApiNotFoundResponse({
    description: 'No existe o el residente no es destinatario.',
  })
  read(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResidentAnnouncementDto> {
    return this.announcements.read(user, id);
  }
}
