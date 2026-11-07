import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { AdminAnnouncementsController } from './controllers/index.js';
import { AnnouncementRepository } from './repositories/index.js';
import { AnnouncementsService } from './services/index.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminAnnouncementsController],
  providers: [AnnouncementsService, AnnouncementRepository],
})
export class AnnouncementsModule {}
