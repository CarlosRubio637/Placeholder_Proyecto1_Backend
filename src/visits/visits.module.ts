import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { VisitsController } from './visits.controller.js';
import { VisitsCronService } from './visits.cron.js';
import { VisitsService } from './visits.service.js';

// Control de acceso de visitas (Módulo 4). H14: preautorización y vencimiento.
@Module({
  imports: [NotificationsModule],
  controllers: [VisitsController],
  providers: [VisitsService, VisitsCronService],
})
export class VisitsModule {}
