import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { PackagesController } from './packages.controller.js';
import { PackagesService } from './packages.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [PackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
