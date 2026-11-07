import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { AdminAreasController } from './controllers/index.js';
import { AreaRepository } from './repositories/index.js';
import { AreasService } from './services/index.js';

/** Módulo 2: reservas de áreas comunes (H9; H7, H6 y H8 se suman aquí). */
@Module({
  imports: [NotificationsModule],
  controllers: [AdminAreasController],
  providers: [AreasService, AreaRepository],
})
export class ReservationsModule {}
