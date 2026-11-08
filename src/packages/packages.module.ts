import { Module } from '@nestjs/common';
import { NotificationsModule } from '@Notifications';
import { MyPackagesController, PackagesController } from './packages.controller.js';
import { PackagesService } from './packages.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [PackagesController, MyPackagesController],
  providers: [PackagesService],
})
export class PackagesModule {}
