import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
  AnnouncementDto,
  AudienceCountDto,
  AudienceQueryDto,
  CreateAnnouncementDto,
} from '../dto/index.js';
import { AnnouncementsService } from '../services/index.js';

@ApiTags('comunicados')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({
  description: 'Solo el Administrador publica comunicados.',
})
@Roles('ADMINISTRADOR')
@Controller('admin/comunicados')
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('audiencia')
  @ApiOperation({
    summary: 'Cuántos residentes recibirían un comunicado (H25)',
  })
  @ApiOkResponse({ type: AudienceCountDto })
  @ApiBadRequestResponse({
    description:
      'Algún id no es uuid o la torre no existe. `field` es towerIds.',
  })
  countAudience(@Query() query: AudienceQueryDto): Promise<AudienceCountDto> {
    return this.announcements.countAudience(query);
  }

  @Post()
  @ApiOperation({
    summary:
      'Publica un comunicado para todo el condominio o para torres (H25)',
  })
  @ApiCreatedResponse({ type: AnnouncementDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos. `field` indica el campo que falló.',
  })
  publish(
    @CurrentUser() admin: User,
    @Body() dto: CreateAnnouncementDto,
  ): Promise<AnnouncementDto> {
    return this.announcements.publish(admin, dto);
  }
}
