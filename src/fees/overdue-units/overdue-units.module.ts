import { Module } from '@nestjs/common';
import { OverdueUnitsController } from './overdue-units.controller.js';
import { OverdueUnitsRepository } from './overdue-units.repository.js';
import { OverdueUnitsService } from './overdue-units.service.js';

@Module({
  controllers: [OverdueUnitsController],
  providers: [OverdueUnitsService, OverdueUnitsRepository],
})
export class OverdueUnitsModule {}
