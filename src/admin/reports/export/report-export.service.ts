import { Injectable, StreamableFile } from '@nestjs/common';
import { todayIso } from '@Common/time';
import { badRequest } from '@Common/validation';
import { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import { AreasUsageService } from '../areas-usage.service.js';
import { DelinquencyService } from '../delinquency.service.js';
import type {
  AreasUsageExportQueryDto,
  DelinquencyExportQueryDto,
  IncidentsReportExportQueryDto,
  ParticipationExportQueryDto,
} from '../dto/report-export-query.dto.js';
import { IncidentsReportService } from '../incidents-report.service.js';
import { ParticipationReportService } from '../participation-report.service.js';
import { renderCsv } from './csv.js';
import {
  EXPORT_CONTENT_TYPES,
  EXPORT_MAX_ROWS,
  EXPORT_MESSAGES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type ExportFormat,
} from './export.constants.js';
import { renderPdf } from './pdf.js';
import {
  currency,
  dateEs,
  dateTimeEs,
  exportFilename,
  money,
  type Cell,
  type ReportTable,
} from './report-table.js';

/**
 * Los reportes se piden con una fila de más que el máximo: si llega, el
 * reporte supera el límite. Así nunca se carga la tabla entera solo para
 * contarla.
 */
const FETCH_ROWS = EXPORT_MAX_ROWS + 1;

const STATUS_ORDER = ['PENDIENTE', 'EN_PROCESO', 'RESUELTO'] as const;
const PRIORITY_ORDER = ['ALTA', 'MEDIA', 'BAJA'] as const;

/**
 * Exportación de los reportes H32 a H35 a PDF y CSV (H36). Cada tabla sale
 * del mismo servicio de cálculo que su endpoint de pantalla, con los mismos
 * filtros, así que las cifras del archivo y las de la pantalla no difieren.
 */
@Injectable()
export class ReportExportService {
  constructor(
    private readonly delinquency: DelinquencyService,
    private readonly areas: AreasUsageService,
    private readonly incidents: IncidentsReportService,
    private readonly participation: ParticipationReportService,
    private readonly prisma: PrismaService,
  ) {}

  /** Morosidad (H32): unidades morosas. */
  async delinquencyTable(
    query: DelinquencyExportQueryDto,
    now = new Date(),
  ): Promise<ReportTable> {
    const filters = { from: query.from, to: query.to };
    const report = await this.delinquency.getReport(
      { ...filters, page: 1, pageSize: FETCH_ROWS },
      now,
    );
    const period = this.delinquency.resolveRange(filters, todayIso(now));
    const { summary } = report;
    return {
      report: 'morosidad',
      title: 'Reporte de morosidad',
      period,
      filters: [
        ['Vencimiento desde', dateEs(period.from)],
        ['Vencimiento hasta', dateEs(period.to)],
      ],
      summary: [
        ['Monto adeudado', currency(summary.owedAmount)],
        ['Unidades morosas', String(summary.overdueUnits)],
        [
          'Unidades morosas con residente activo',
          String(summary.overdueActiveUnits),
        ],
        ['Unidades con residente activo', String(summary.activeUnits)],
        ['Porcentaje de unidades morosas', `${summary.overduePct} %`],
      ],
      tableTitle: 'Unidades morosas',
      columns: ['Unidad', 'Monto adeudado ($)', 'Antigüedad (días)'],
      rows: report.data.map((row) => [
        row.unitCode,
        money(row.owedAmount),
        row.ageDays,
      ]),
    };
  }

  /** Uso de áreas comunes (H33): una fila por área habilitada. */
  async areasTable(
    query: AreasUsageExportQueryDto,
    now = new Date(),
  ): Promise<ReportTable> {
    const filters = { from: query.from, to: query.to };
    const report = await this.areas.getReport(filters, now);
    const period = this.areas.resolvePeriod(filters, todayIso(now));
    return {
      report: 'areas',
      title: 'Reporte de uso de áreas comunes',
      period,
      filters: [
        ['Desde', dateEs(period.from)],
        ['Hasta', dateEs(period.to)],
      ],
      summary: [
        ['Área más usada', report.mostUsed?.name ?? 'Sin datos'],
        ['Área menos usada', report.leastUsed?.name ?? 'Sin datos'],
        ['Áreas habilitadas', String(report.data.length)],
      ],
      tableTitle: 'Uso por área',
      columns: [
        'Área',
        'Reservas confirmadas',
        'Reservas canceladas',
        'Horas reservadas',
        'Horas habilitadas',
        'Ocupación (%)',
      ],
      rows: report.data.map((area) => [
        area.name,
        area.confirmed,
        area.cancelled,
        area.reservedHours,
        area.enabledHours,
        area.occupancyPct,
      ]),
    };
  }

  /** Incidencias (H34): la tabla cruzada va al resumen; la tabla son las abiertas con más de 7 días. */
  async incidentsTable(
    query: IncidentsReportExportQueryDto,
    now = new Date(),
  ): Promise<ReportTable> {
    const filters = { from: query.from, to: query.to };
    const report = await this.incidents.getReport(
      { ...filters, page: 1, pageSize: FETCH_ROWS },
      now,
    );
    const period = this.incidents.resolvePeriod(filters, todayIso(now));
    const count = (status: string, priority: string) =>
      report.matrix.find(
        (cell) => cell.status === status && cell.priority === priority,
      )?.count ?? 0;

    return {
      report: 'incidencias',
      title: 'Reporte de incidencias',
      period,
      filters: [
        ['Creadas desde', dateEs(period.from)],
        ['Creadas hasta', dateEs(period.to)],
      ],
      summary: [
        [
          'Abiertas del periodo (Pendiente o En proceso)',
          String(report.openTotal),
        ],
        [
          'Tiempo promedio de resolución',
          report.avgResolutionDays === null
            ? 'Sin datos'
            : `${report.avgResolutionDays} días`,
        ],
        ...STATUS_ORDER.map((status): [string, string] => [
          `${STATUS_LABELS[status]} (Alta / Media / Baja)`,
          PRIORITY_ORDER.map((priority) => count(status, priority)).join(' / '),
        ]),
        ['Abiertas hoy con más de 7 días', String(report.stale.total)],
      ],
      tableTitle: 'Incidencias abiertas con más de 7 días',
      columns: [
        'Número',
        'Título',
        'Unidad',
        'Estado',
        'Prioridad',
        'Responsable',
        'Días abierta',
      ],
      rows: report.stale.data.map((row) => [
        row.number,
        row.title,
        row.unitCode,
        STATUS_LABELS[row.status],
        PRIORITY_LABELS[row.priority],
        row.assignee ?? 'Sin asignar',
        row.daysOpen,
      ]),
    };
  }

  /** Participación (H35): una fila por tema de cada asamblea. */
  async participationTable(
    query: ParticipationExportQueryDto,
    now = new Date(),
  ): Promise<ReportTable> {
    const filters = {
      assemblyId: query.assemblyId,
      from: query.from,
      to: query.to,
    };
    const report = await this.participation.getReport(
      { ...filters, page: 1, pageSize: FETCH_ROWS },
      now,
    );
    const period = this.participation.resolvePeriod(filters, todayIso(now));

    const rows: Cell[][] = report.data.flatMap((assembly) => {
      const head: Cell[] = [
        assembly.title,
        STATUS_LABELS[assembly.status],
        dateTimeEs(assembly.openedAt),
        assembly.avgParticipationPct,
      ];
      return assembly.topics.length === 0
        ? [[...head, null, null, null, null]]
        : assembly.topics.map((topic) => [
            ...head,
            topic.question,
            topic.votedUnits,
            topic.eligibleUnits,
            topic.participationPct,
          ]);
    });

    return {
      report: 'participacion',
      title: 'Reporte de participación en votaciones',
      period,
      filters: query.assemblyId
        ? [['Asamblea', report.data[0]?.title ?? 'No encontrada']]
        : [
            ['Apertura desde', dateEs(period.from)],
            ['Apertura hasta', dateEs(period.to)],
          ],
      summary: [['Asambleas', String(report.total)]],
      tableTitle: 'Participación por tema',
      columns: [
        'Asamblea',
        'Estado',
        'Apertura',
        'Participación de la asamblea (%)',
        'Tema',
        'Unidades que votaron',
        'Unidades habilitadas',
        'Participación del tema (%)',
      ],
      rows,
    };
  }

  /** El archivo descargable, con su tipo y su nombre `<reporte>_<desde>_<hasta>`. */
  async toFile(
    table: ReportTable,
    format: ExportFormat,
    user: User,
    now = new Date(),
  ): Promise<StreamableFile> {
    if (table.rows.length > EXPORT_MAX_ROWS) {
      throw badRequest('to', EXPORT_MESSAGES.tooManyRows);
    }
    const content =
      format === 'csv'
        ? renderCsv(table)
        : await renderPdf(table, {
            generatedAt: now,
            generatedBy: await this.authorName(user),
          });
    return new StreamableFile(content, {
      type: EXPORT_CONTENT_TYPES[format],
      disposition: `attachment; filename="${exportFilename(table, format)}"`,
      length: content.length,
    });
  }

  /** Nombre del administrador para el PDF; su correo si no tiene perfil. */
  private async authorName(user: User): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: user.id },
      select: { fullName: true },
    });
    return profile?.fullName ?? user.email;
  }
}
