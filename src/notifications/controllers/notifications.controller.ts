import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  ListNotificationsQueryDto,
  MarkAllReadDto,
  NotificationPageDto,
  NotificationReadDto,
  UnreadCountDto,
} from '../dto/index.js';
import {
  NOTIFICATION_NOT_FOUND,
  NotificationInboxService,
} from '../services/index.js';

/**
 * Bandeja de notificaciones (H31).
 *
 * Sin @Roles: la usan los tres roles con sesión. Solo lee y marca; enviar
 * avisos sigue sin endpoint HTTP (H30).
 */
@ApiTags('notificaciones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token ausente, inválido o expirado.' })
@Controller('notificaciones')
export class NotificationsController {
  constructor(private readonly inbox: NotificationInboxService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista las notificaciones del usuario, más recientes primero (H31)',
  })
  @ApiOkResponse({ type: NotificationPageDto })
  @ApiBadRequestResponse({
    description: 'Filtro o paginación inválidos. `field` indica cuál.',
  })
  list(
    @CurrentUser() user: User,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    return this.inbox.list(user.id, query);
  }

  @Get('no-leidas/conteo')
  @ApiOperation({ summary: 'Cantidad de notificaciones No leídas (H31)' })
  @ApiOkResponse({ type: UnreadCountDto })
  countUnread(@CurrentUser() user: User): Promise<UnreadCountDto> {
    return this.inbox.countUnread(user.id);
  }

  @Patch('leidas')
  @ApiOperation({ summary: 'Marca todas las No leídas como leídas (H31)' })
  @ApiOkResponse({ type: MarkAllReadDto })
  markAllRead(@CurrentUser() user: User): Promise<MarkAllReadDto> {
    return this.inbox.markAllRead(user.id);
  }

  @Patch(':id/leida')
  @ApiOperation({ summary: 'Marca una notificación como leída (H31)' })
  @ApiOkResponse({ type: NotificationReadDto })
  @ApiNotFoundResponse({
    description: 'La notificación no existe o es de otro usuario.',
  })
  markRead(
    @CurrentUser() user: User,
    // Un id que no es uuid tampoco existe: 404, como pide el contrato.
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException(NOTIFICATION_NOT_FOUND),
      }),
    )
    id: string,
  ): Promise<NotificationReadDto> {
    return this.inbox.markRead(user.id, id);
  }
}
