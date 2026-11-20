import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  FeeGenerationsController,
  FeeTasksController,
} from './controllers/index.js';
import { FeeTasksCron } from './fee-tasks.cron.js';
import {
  FeeGenerationRepository,
  FeeTasksRepository,
} from './repositories/index.js';
import { FeeGenerationsService, FeeTasksService } from './services/index.js';

@Module({
  imports: [NotificationsModule],
  controllers: [FeeGenerationsController, FeeTasksController],
  providers: [
    FeeGenerationsService,
    FeeGenerationRepository,
    FeeTasksService,
    FeeTasksRepository,
    FeeTasksCron,
  ],
})
export class FeesModule {}
