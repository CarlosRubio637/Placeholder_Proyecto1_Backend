import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { DelinquencyRepository } from './delinquency.repository.js';
import { DelinquencyService } from './delinquency.service.js';
import { ReportsController } from './reports.controller.js';

// Reportes de administración (Módulo 10). H32: panel de morosidad.
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [DelinquencyRepository, DelinquencyService],
import { IncidentsReportRepository } from './incidents-report.repository.js';
import { IncidentsReportService } from './incidents-report.service.js';
import { ReportsController } from './reports.controller.js';

// Reportes de administración (Módulo 10). H34: incidencias abiertas.
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [IncidentsReportRepository, IncidentsReportService],
})
export class ReportsModule {}
