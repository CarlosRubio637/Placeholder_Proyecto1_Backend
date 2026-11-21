import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
  AdminAnnouncementPageDto,
  AdminAnnouncementsQueryDto,
  AnnouncementDto,
  AnnouncementReadsPageDto,
  AnnouncementReadsQueryDto,
  AudienceCountDto,
  AudienceQueryDto,
  CreateAnnouncementDto,
} from '../dto/index.js';
import {
  AnnouncementReadsService,
  AnnouncementsService,
} from '../services/index.js';

@ApiTags('comunicados')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@ApiForbiddenResponse({
  description: 'Solo el Administrador publica comunicados y ve sus lecturas.',
})
@Roles('ADMINISTRADOR')
@Controller('admin/comunicados')
export class AdminAnnouncementsController {
  constructor(
    private readonly announcements: AnnouncementsService,
    private readonly reads: AnnouncementReadsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Comunicados publicados con su estado y sus lecturas (H26)',
  })
  @ApiOkResponse({ type: AdminAnnouncementPageDto })
  @ApiBadRequestResponse({
    description:
      'Estado, categoría o paginación inválidos. `field` indica cuál.',
  })
  list(
    @Query() query: AdminAnnouncementsQueryDto,
  ): Promise<AdminAnnouncementPageDto> {
    return this.reads.list(query);
  }

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

  @Get(':id/lecturas')
  @ApiOperation({
    summary: 'Comunicado completo y lectura de cada destinatario (H26)',
  })
  @ApiOkResponse({ type: AnnouncementReadsPageDto })
  @ApiBadRequestResponse({
    description: 'El id no es un uuid, o read o la paginación son inválidos.',
  })
  @ApiNotFoundResponse({ description: 'El comunicado no existe.' })
  readers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AnnouncementReadsQueryDto,
  ): Promise<AnnouncementReadsPageDto> {
    return this.reads.readers(id, query);
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
