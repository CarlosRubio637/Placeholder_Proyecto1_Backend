import { Module } from '@nestjs/common';
import { ProfileController } from './controllers/index.js';
import { ProfileRepository } from './repositories/index.js';
import { ProfileService } from './services/index.js';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
})
export class DirectoryModule {}
