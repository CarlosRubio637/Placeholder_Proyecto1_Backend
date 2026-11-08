import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  AdminAreasController,
  AreasController,
  ReservationsController,
} from './controllers/index.js';
import { AreaRepository, ReservationRepository } from './repositories/index.js';
import { AreasService, ReservationsService } from './services/index.js';

/** Módulo 2: reservas de áreas comunes (H9, H7 y H6; H8 se suma aquí). */
@Module({
  imports: [NotificationsModule],
  controllers: [AdminAreasController, AreasController, ReservationsController],
  providers: [AreasService, AreaRepository, ReservationsService, ReservationRepository],
})
export class ReservationsModule {}
