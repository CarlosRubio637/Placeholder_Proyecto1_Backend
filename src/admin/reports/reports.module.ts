import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
import { AreasUsageRepository } from './areas-usage.repository.js';
import { AreasUsageService } from './areas-usage.service.js';
import { DelinquencyRepository } from './delinquency.repository.js';
import { DelinquencyService } from './delinquency.service.js';
import { IncidentsReportRepository } from './incidents-report.repository.js';
import { IncidentsReportService } from './incidents-report.service.js';
import { ParticipationReportRepository } from './participation-report.repository.js';
import { ParticipationReportService } from './participation-report.service.js';
import { ReportsController } from './reports.controller.js';
import { SummaryService } from './summary.service.js';

// Reportes de administración (Módulo 10). H32: panel de morosidad.
// H34: incidencias abiertas. H33: uso de áreas comunes.
// H35: participación en votaciones. H37: resumen de un vistazo.
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
    ParticipationReportRepository,
    ParticipationReportService,
    SummaryService,
  ],
})
export class ReportsModule {}
