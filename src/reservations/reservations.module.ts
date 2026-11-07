import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  AdminAreasController,
  AreasController,
  ReservationsController,
} from './controllers/index.js';
import { AreaRepository, ReservationRepository } from './repositories/index.js';
import { AreasService, ReservationsService } from './services/index.js';

/** Módulo 2: reservas de áreas comunes (H9 y H7; H6 y H8 se suman aquí). */
@Module({
  imports: [NotificationsModule],
  controllers: [AdminAreasController, AreasController, ReservationsController],
  providers: [AreasService, AreaRepository, ReservationsService, ReservationRepository],
})
export class ReservationsModule {}
