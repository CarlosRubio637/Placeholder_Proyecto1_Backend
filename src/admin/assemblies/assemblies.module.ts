import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { NotificationsModule } from '@Notifications';
import { AssembliesService } from './assemblies.service.js';
import { AssembliesController } from './assemblies.controller.js';
import { AssembliesCronService } from './assemblies.cron.js';

// AppModule, porque lo usan también otros módulos (por ejemplo H14).
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [AssembliesController],
  providers: [AssembliesService, AssembliesCronService],
})
export class AssembliesModule {}
