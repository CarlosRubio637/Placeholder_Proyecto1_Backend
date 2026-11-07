import { Module } from '@nestjs/common';
import { TowersController } from './towers.controller.js';
import { TowersService } from './towers.service.js';

@Module({
  controllers: [TowersController],
  providers: [TowersService],
})
export class TowersModule {}