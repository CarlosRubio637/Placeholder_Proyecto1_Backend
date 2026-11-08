import { Module } from '@nestjs/common';
import { PrismaModule } from '@Prisma';
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
