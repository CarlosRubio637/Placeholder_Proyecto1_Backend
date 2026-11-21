import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import {
  AdminAnnouncementsController,
  ResidentAnnouncementsController,
} from './controllers/index.js';
import { AnnouncementRepository } from './repositories/index.js';
import {
  AnnouncementReadsService,
  AnnouncementsService,
  ResidentAnnouncementsService,
} from './services/index.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminAnnouncementsController, ResidentAnnouncementsController],
  providers: [
    AnnouncementsService,
    ResidentAnnouncementsService,
    AnnouncementReadsService,
    AnnouncementRepository,
  ],
})
export class AnnouncementsModule {}
