import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { AreasUsageRepository } from './areas-usage.repository.js';
import { AreasUsageService } from './areas-usage.service.js';
import { DelinquencyRepository } from './delinquency.repository.js';
import { DelinquencyService } from './delinquency.service.js';
import { IncidentsReportRepository } from './incidents-report.repository.js';
import { IncidentsReportService } from './incidents-report.service.js';
import { ReportsController } from './reports.controller.js';

// Reportes de administración (Módulo 10). H32: panel de morosidad.
// H34: incidencias abiertas. H33: uso de áreas comunes.
@Module({
  imports: [PrismaModule],
  controllers: [ReportsController],
  providers: [
    DelinquencyRepository,
    DelinquencyService,
    IncidentsReportRepository,
    IncidentsReportService,
    AreasUsageRepository,
    AreasUsageService,
  ],
})
export class ReportsModule {}
