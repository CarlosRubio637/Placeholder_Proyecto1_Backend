import { Module } from '@nestjs/common';
import {
  NotificationInboxService,
  NotificationsService,
} from '@Notifications/services';
import {
  NotificationInboxRepository,
  NotificationRepository,
} from '@Notifications/repositories';
import { NotificationsController } from './controllers/index.js';

// Enviar avisos no tiene endpoint a propósito (H30): ningún rol puede enviar
// por HTTP, solo el código del servidor. Los módulos que avisan importan este
// módulo y llaman a NotificationsService.send. NotificationRepository NO se
// exporta, para que nadie cree notificaciones sin pasar por la validación.
//
// El controlador es la bandeja (H31): cada usuario lista, cuenta y marca como
// leídas solo sus notificaciones, mediante NotificationInboxRepository.
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationRepository,
    NotificationInboxService,
    NotificationInboxRepository,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
