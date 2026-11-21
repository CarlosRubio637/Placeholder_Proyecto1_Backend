import { Module } from '@nestjs/common';
import { DirectoryController, ProfileController } from './controllers/index.js';
import {
  DirectoryRepository,
  ProfileRepository,
} from './repositories/index.js';
import { DirectoryService, ProfileService } from './services/index.js';

@Module({
  controllers: [ProfileController, DirectoryController],
  providers: [
    ProfileService,
    ProfileRepository,
    DirectoryService,
    DirectoryRepository,
  ],
})
export class DirectoryModule {}
