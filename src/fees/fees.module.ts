import { Module } from '@nestjs/common';
import { FeeGenerationsController } from './controllers/index.js';
import { FeeGenerationRepository } from './repositories/index.js';
import { FeeGenerationsService } from './services/index.js';

@Module({
  controllers: [FeeGenerationsController],
  providers: [FeeGenerationsService, FeeGenerationRepository],
})
export class FeesModule {}
