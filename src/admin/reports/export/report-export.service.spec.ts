import { BadRequestException, type StreamableFile } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import type { AreasUsageService } from '../areas-usage.service.js';
import type { DelinquencyService } from '../delinquency.service.js';
import type { IncidentsReportService } from '../incidents-report.service.js';
import type { ParticipationReportService } from '../participation-report.service.js';
import { EXPORT_MAX_ROWS, EXPORT_MESSAGES } from './export.constants.js';
import type { ReportTable } from './report-table.js';
import { ReportExportService } from './report-export.service.js';

// Viernes 20 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-20T16:00:00Z');
const ADMIN = { id: 'admin-id', email: 'admin@condominio.test' } as User;

function setup() {
  const delinquency = {
    getReport: vi.fn(),
    resolveRange: vi.fn((q: { from?: string; to?: string }) => ({
      from: q.from ?? '2025-11-20',
      to: q.to ?? '2026-11-20',
    })),
  };
  const areas = {
    getReport: vi.fn(),
    resolvePeriod: vi.fn(() => ({ from: '2026-11-01', to: '2026-11-20' })),
  };
  const incidents = {
    getReport: vi.fn(),
    resolvePeriod: vi.fn(() => ({ from: '2026-11-01', to: '2026-11-20' })),
  };
  const participation = {
    getReport: vi.fn(),
    resolvePeriod: vi.fn(() => ({ from: '2025-11-20', to: '2026-11-20' })),
  };
  const prisma = {
    profile: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ fullName: 'Administración General' }),
    },
  };
  const service = new ReportExportService(
    delinquency as unknown as DelinquencyService,
    areas as unknown as AreasUsageService,
    incidents as unknown as IncidentsReportService,
    participation as unknown as ParticipationReportService,
    prisma as unknown as PrismaService,
  );
  return { service, delinquency, areas, incidents, participation, prisma };
}

const delinquencyReport = (rows: number) => ({
  summary: {
    owedAmount: 1275.5,
    overdueUnits: rows,
    overdueActiveUnits: 5,
    activeUnits: 40,
    overduePct: 12.5,
  },
  data: Array.from({ length: rows }, (_, index) => ({
    unitCode: `A-${String(index).padStart(3, '0')}`,
    owedAmount: 255,
    ageDays: 98,
  })),
  total: rows,
  page: 1,
  pageSize: EXPORT_MAX_ROWS + 1,
});

async function body(file: StreamableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

describe('H36. Exportación de reportes en PDF y CSV', () => {
  describe('AC: las cifras salen del mismo servicio que la pantalla', () => {
    it('morosidad pide el reporte con los mismos filtros y sin paginar', async () => {
      const { service, delinquency } = setup();
      delinquency.getReport.mockResolvedValue(delinquencyReport(2));

      const table = await service.delinquencyTable(
        { format: 'csv', from: '2026-01-01', to: '2026-11-20' },
        NOW,
      );

      expect(delinquency.getReport).toHaveBeenCalledWith(
        {
          from: '2026-01-01',
          to: '2026-11-20',
          page: 1,
          pageSize: EXPORT_MAX_ROWS + 1,
        },
        NOW,
      );
      expect(table.period).toEqual({ from: '2026-01-01', to: '2026-11-20' });
      expect(table.columns).toEqual([
        'Unidad',
        'Monto adeudado ($)',
        'Antigüedad (días)',
      ]);
      expect(table.rows).toEqual([
        ['A-000', '255.00', 98],
        ['A-001', '255.00', 98],
      ]);
      expect(table.summary).toContainEqual(['Monto adeudado', '$1,275.50']);
      expect(table.summary).toContainEqual([
        'Porcentaje de unidades morosas',
        '12.5 %',
      ]);
    });

    it('DEF-200: el monto del resumen lleva separador de miles; la tabla y el CSV no', async () => {
      const { service, delinquency } = setup();
      const report = delinquencyReport(1);
      delinquency.getReport.mockResolvedValue({
        ...report,
        summary: { ...report.summary, owedAmount: 2250 },
        data: [{ unitCode: 'C-201', owedAmount: 1270, ageDays: 165 }],
      });

      const table = await service.delinquencyTable({ format: 'pdf' }, NOW);

      expect(table.summary).toContainEqual(['Monto adeudado', '$2,250.00']);
      // Las celdas también van al CSV, donde la coma separa columnas.
      expect(table.rows).toEqual([['C-201', '1270.00', 165]]);
    });

    it('incidencias resume la tabla cruzada y lista las abiertas con más de 7 días', async () => {
      const { service, incidents } = setup();
      incidents.getReport.mockResolvedValue({
        matrix: [
          { status: 'PENDIENTE', priority: 'ALTA', count: 2 },
          { status: 'PENDIENTE', priority: 'MEDIA', count: 1 },
          { status: 'EN_PROCESO', priority: 'BAJA', count: 3 },
        ],
        openTotal: 6,
        avgResolutionDays: null,
        stale: {
          data: [
            {
              number: 'INC-2026-00012',
              title: 'Fuga, baño',
              unitCode: 'A-101',
              status: 'EN_PROCESO',
              priority: 'ALTA',
              assignee: null,
              daysOpen: 20,
            },
          ],
          total: 1,
          page: 1,
          pageSize: EXPORT_MAX_ROWS + 1,
        },
      });

      const table = await service.incidentsTable({ format: 'pdf' }, NOW);

      expect(incidents.getReport).toHaveBeenCalledWith(
        {
          from: undefined,
          to: undefined,
          page: 1,
          pageSize: EXPORT_MAX_ROWS + 1,
        },
        NOW,
      );
      expect(table.summary).toEqual(
        expect.arrayContaining([
          ['Abiertas del periodo (Pendiente o En proceso)', '6'],
          ['Tiempo promedio de resolución', 'Sin datos'],
          ['Pendiente (Alta / Media / Baja)', '2 / 1 / 0'],
          ['En proceso (Alta / Media / Baja)', '0 / 0 / 3'],
          ['Resuelto (Alta / Media / Baja)', '0 / 0 / 0'],
        ]),
      );
      expect(table.rows).toEqual([
        [
          'INC-2026-00012',
          'Fuga, baño',
          'A-101',
          'En proceso',
          'Alta',
          'Sin asignar',
          20,
        ],
      ]);
    });

    it('áreas muestra "Sin datos" si no hay reservas confirmadas', async () => {
      const { service, areas } = setup();
      areas.getReport.mockResolvedValue({
        data: [
          {
            areaId: 'a',
            name: 'Piscina',
            confirmed: 0,
            cancelled: 1,
            reservedHours: 0,
            enabledHours: 280,
            occupancyPct: 0,
          },
        ],
        mostUsed: null,
        leastUsed: null,
      });

      const table = await service.areasTable({ format: 'csv' }, NOW);

      expect(table.summary).toContainEqual(['Área más usada', 'Sin datos']);
      expect(table.rows).toEqual([['Piscina', 0, 1, 0, 280, 0]]);
    });

    it('participación lleva una fila por tema de cada asamblea', async () => {
      const { service, participation } = setup();
      participation.getReport.mockResolvedValue({
        data: [
          {
            assemblyId: 'x',
            title: 'Asamblea de noviembre',
            status: 'CERRADA',
            openedAt: new Date('2026-11-05T15:30:00Z'),
            avgParticipationPct: 62.5,
            topics: [
              {
                question: '¿Presupuesto?',
                votedUnits: 15,
                eligibleUnits: 24,
                participationPct: 62.5,
              },
              {
                question: '¿Fachada?',
                votedUnits: 15,
                eligibleUnits: 24,
                participationPct: 62.5,
              },
            ],
          },
        ],
        total: 1,
        page: 1,
        pageSize: EXPORT_MAX_ROWS + 1,
      });

      const table = await service.participationTable(
        { format: 'csv', assemblyId: 'x' },
        NOW,
      );

      expect(table.filters).toEqual([['Asamblea', 'Asamblea de noviembre']]);
      expect(table.rows).toEqual([
        [
          'Asamblea de noviembre',
          'Cerrada',
          '05/11/2026 09:30',
          62.5,
          '¿Presupuesto?',
          15,
          24,
          62.5,
        ],
        [
          'Asamblea de noviembre',
          'Cerrada',
          '05/11/2026 09:30',
          62.5,
          '¿Fachada?',
          15,
          24,
          62.5,
        ],
      ]);
    });
  });

  describe('AC: el archivo', () => {
    const table: ReportTable = {
      report: 'morosidad',
      title: 'Reporte de morosidad',
      period: { from: '2025-10-28', to: '2026-10-28' },
      filters: [],
      summary: [],
      tableTitle: 'Unidades morosas',
      columns: ['Unidad'],
      rows: [['A-101']],
    };

    it('el CSV se descarga como <reporte>_<desde>_<hasta>.csv', async () => {
      const { service } = setup();
      const file = await service.toFile(table, 'csv', ADMIN, NOW);
      expect(file.getHeaders()).toMatchObject({
        type: 'text/csv; charset=utf-8',
        disposition:
          'attachment; filename="morosidad_2025-10-28_2026-10-28.csv"',
      });
      expect((await body(file)).toString('utf8')).toBe('﻿Unidad\r\nA-101\r\n');
    });

    it('el PDF lleva el nombre del administrador que lo generó', async () => {
      const { service, prisma } = setup();
      const file = await service.toFile(table, 'pdf', ADMIN, NOW);
      expect(prisma.profile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'admin-id' },
        select: { fullName: true },
      });
      expect(file.getHeaders()).toMatchObject({
        type: 'application/pdf',
        disposition:
          'attachment; filename="morosidad_2025-10-28_2026-10-28.pdf"',
      });
      expect((await body(file)).subarray(0, 5).toString('latin1')).toBe(
        '%PDF-',
      );
    });

    it('el CSV no consulta el perfil: solo el PDF lleva el autor', async () => {
      const { service, prisma } = setup();
      await service.toFile(table, 'csv', ADMIN, NOW);
      expect(prisma.profile.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('AC: no exporta más de 5,000 filas', () => {
    it('400 con 5,001 filas', async () => {
      const { service, delinquency } = setup();
      delinquency.getReport.mockResolvedValue(
        delinquencyReport(EXPORT_MAX_ROWS + 1),
      );
      const table = await service.delinquencyTable({ format: 'csv' }, NOW);

      const error = await service
        .toFile(table, 'csv', ADMIN, NOW)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: [EXPORT_MESSAGES.tooManyRows],
      });
    });

    it('exporta exactamente 5,000 filas', async () => {
      const { service, delinquency } = setup();
      delinquency.getReport.mockResolvedValue(
        delinquencyReport(EXPORT_MAX_ROWS),
      );
      const table = await service.delinquencyTable({ format: 'csv' }, NOW);
      const file = await service.toFile(table, 'csv', ADMIN, NOW);
      const lines = (await body(file)).toString('utf8').trim().split('\r\n');
      expect(lines).toHaveLength(EXPORT_MAX_ROWS + 1);
    });
  });
});
