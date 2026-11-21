import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  AdminIncidentsController,
  IncidentsController,
} from './controllers/index.js';
import { IncidentPhotosInterceptor } from './interceptors/index.js';
import {
  AdminIncidentRepository,
  IncidentRepository,
} from './repositories/index.js';
import { AdminIncidentsService, IncidentsService } from './services/index.js';
import { IncidentPhotoStorage } from './storage/index.js';

/** Módulo 3: incidencias y mantenimiento (H10, H11, H12; H13 se suma aquí). */
@Module({
  imports: [NotificationsModule],
  controllers: [IncidentsController, AdminIncidentsController],
  providers: [
    IncidentsService,
    IncidentRepository,
    AdminIncidentsService,
    AdminIncidentRepository,
    IncidentPhotoStorage,
    IncidentPhotosInterceptor,
  ],
})
export class IncidentsModule {}
