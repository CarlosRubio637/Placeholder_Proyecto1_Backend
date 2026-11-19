import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { SecurityVisitsController } from './security-visits.controller.js';
import { SecurityVisitsService } from './security-visits.service.js';
import { VisitsController } from './visits.controller.js';
import { VisitsCronService } from './visits.cron.js';
import { VisitsService } from './visits.service.js';

// Control de acceso de visitas (Módulo 4). H14: preautorización y vencimiento.
// H16: portería (búsqueda, solicitudes sin autorización y entrada).
@Module({
  imports: [NotificationsModule],
  controllers: [VisitsController, SecurityVisitsController],
  providers: [VisitsService, VisitsCronService, SecurityVisitsService],
})
export class VisitsModule {}
