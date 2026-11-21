import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { InsideVisitsController } from './inside-visits.controller.js';
import { InsideVisitsService } from './inside-visits.service.js';
import { ResidentVisitsService } from './resident-visits.service.js';
import { SecurityVisitsController } from './security-visits.controller.js';
import { SecurityVisitsService } from './security-visits.service.js';
import { VisitsController } from './visits.controller.js';
import { VisitsCronService } from './visits.cron.js';
import { VisitsService } from './visits.service.js';

// Control de acceso de visitas (Módulo 4). H14: preautorización y vencimiento.
// H15: mis visitas (cancelar y responder solicitudes). H16: portería
// (búsqueda, solicitudes sin autorización y entrada). H18: quién está dentro.
@Module({
  imports: [NotificationsModule],
  controllers: [
    VisitsController,
    SecurityVisitsController,
    InsideVisitsController,
  ],
  providers: [
    VisitsService,
    VisitsCronService,
    SecurityVisitsService,
    ResidentVisitsService,
    InsideVisitsService,
  ],
})
export class VisitsModule {}
