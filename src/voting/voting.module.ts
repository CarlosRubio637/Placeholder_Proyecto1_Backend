import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { ResultsController } from './results.controller.js';
import { ResultsService } from './results.service.js';
import { VotingController } from './voting.controller.js';
import { VotingService } from './voting.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [VotingController, ResultsController],
  providers: [VotingService, ResultsService],
})
export class VotingModule {}
