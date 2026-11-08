import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { VotingController } from './voting.controller.js';
import { VotingService } from './voting.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [VotingController],
  providers: [VotingService],
})
export class VotingModule {}
