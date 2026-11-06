import { Module } from '@nestjs/common';
import { NotificationsService } from '@Notifications/services';
import { NotificationRepository } from '@Notifications/repositories';

// Sin controlador a propósito (H30): ningún rol puede enviar avisos por HTTP,
// solo el código del servidor. Los módulos que avisan importan este módulo y
// llaman a NotificationsService.send. El repositorio NO se exporta, para que
// nadie cree notificaciones sin pasar por la validación del servicio.
@Module({
  providers: [NotificationsService, NotificationRepository],
  exports: [NotificationsService],
})
export class NotificationsModule {}
