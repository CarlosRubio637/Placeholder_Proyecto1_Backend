import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  AdminAnnouncementsController,
  ResidentAnnouncementsController,
} from './controllers/index.js';
import { AnnouncementRepository } from './repositories/index.js';
import {
  AnnouncementsService,
  ResidentAnnouncementsService,
} from './services/index.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminAnnouncementsController, ResidentAnnouncementsController],
  providers: [
    AnnouncementsService,
    ResidentAnnouncementsService,
    AnnouncementRepository,
  ],
})
export class AnnouncementsModule {}
