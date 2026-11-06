import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { IncidentsController } from './controllers/index.js';
import { IncidentPhotosInterceptor } from './interceptors/index.js';
import { IncidentRepository } from './repositories/index.js';
import { IncidentsService } from './services/index.js';
import { IncidentPhotoStorage } from './storage/index.js';

/** Módulo 3: incidencias y mantenimiento (H10; H11-H13 se suman aquí). */
@Module({
  imports: [NotificationsModule],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    IncidentRepository,
    IncidentPhotoStorage,
    IncidentPhotosInterceptor,
  ],
})
export class IncidentsModule {}
