import { BadRequestException } from '@nestjs/common';
import { IncidentPriority, IncidentStatus } from '@PrismaClient';
import { INCIDENTS_REPORT_MESSAGES } from './incidents-report.constants.js';
import type {
  IncidentsReportRepository,
  StaleIncidentRow,
} from './incidents-report.repository.js';
import {
  IncidentsReportService,
  periodInstants,
} from './incidents-report.service.js';

// Domingo 8 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-08T16:00:00Z');
const TODAY = '2026-11-08';
const DAY_MS = 24 * 60 * 60 * 1000;

function setup(
  overrides: Partial<Record<keyof IncidentsReportRepository, unknown>> = {},
) {
  const repository = {
    countByStatusAndPriority: vi.fn().mockResolvedValue([]),
    resolutionTimes: vi.fn().mockResolvedValue([]),
    staleOpen: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
    ...overrides,
  };
  const service = new IncidentsReportService(
    repository as unknown as IncidentsReportRepository,
  );
  return { service, repository };
}

const query = (extra: Record<string, unknown> = {}) => ({
  page: 1,
  pageSize: 20,
  ...extra,
});

async function expectBadRequest(promise: Promise<unknown>, message: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toMatchObject({
    field: 'to',
    message: [message],
  });
}

function staleRow(
  number: string,
  createdAt: string,
  assignee: string | null = null,
): StaleIncidentRow {
  return {
    number,
    title: `Incidencia ${number}`,
    status: IncidentStatus.PENDIENTE,
    priority: IncidentPriority.ALTA,
    createdAt: new Date(createdAt),
    unit: { code: 'A-101' },
    assignee: assignee ? { name: assignee } : null,
  };
}

describe('periodo del reporte de incidencias', () => {
  it('por defecto es el mes actual: del día 1 hasta hoy', () => {
    const { service } = setup();
    expect(service.resolvePeriod({}, TODAY)).toEqual({
      from: '2026-11-01',
      to: '2026-11-08',
    });
  });

  it('acepta un rango personalizado de exactamente 366 días', () => {
    const { service } = setup();
    expect(
      service.resolvePeriod({ from: '2025-11-07', to: '2026-11-08' }, TODAY),
    ).toEqual({ from: '2025-11-07', to: '2026-11-08' });
  });

  it('rechaza un fin anterior al inicio (400)', async () => {
    const { service } = setup();
    await expectBadRequest(
      service.getReport(query({ from: '2026-11-08', to: '2026-11-01' }), NOW),
      INCIDENTS_REPORT_MESSAGES.endBeforeStart,
    );
  });

  it('rechaza un rango de más de 366 días (400)', async () => {
    const { service } = setup();
    await expectBadRequest(
      service.getReport(query({ from: '2025-11-06', to: '2026-11-08' }), NOW),
      INCIDENTS_REPORT_MESSAGES.rangeTooLong,
    );
  });

  it('convierte las fechas a instantes en la hora del condominio (UTC−6)', () => {
    expect(periodInstants({ from: '2026-11-01', to: '2026-11-08' })).toEqual({
      gte: new Date('2026-11-01T06:00:00.000Z'),
      lt: new Date('2026-11-09T06:00:00.000Z'),
    });
  });
});

describe('reporte de incidencias abiertas', () => {
  it('arma la tabla 3 × 3 con ceros y suma las abiertas', async () => {
    const { service } = setup({
      countByStatusAndPriority: vi.fn().mockResolvedValue([
        {
          status: IncidentStatus.PENDIENTE,
          priority: IncidentPriority.ALTA,
          count: 2,
        },
        {
          status: IncidentStatus.EN_PROCESO,
          priority: IncidentPriority.BAJA,
          count: 3,
        },
        {
          status: IncidentStatus.RESUELTO,
          priority: IncidentPriority.MEDIA,
          count: 4,
        },
      ]),
    });

    const report = await service.getReport(query(), NOW);

    expect(report.matrix).toHaveLength(9);
    expect(report.matrix[0]).toEqual({
      status: IncidentStatus.PENDIENTE,
      priority: IncidentPriority.ALTA,
      count: 2,
    });
    expect(
      report.matrix.find(
        (c) =>
          c.status === IncidentStatus.PENDIENTE &&
          c.priority === IncidentPriority.BAJA,
      )?.count,
    ).toBe(0);
    // Las 4 resueltas no cuentan como abiertas.
    expect(report.openTotal).toBe(5);
  });

  it('pasa el periodo como instantes a las consultas', async () => {
    const { service, repository } = setup();
    await service.getReport(
      query({ from: '2026-10-01', to: '2026-10-31' }),
      NOW,
    );

    const period = {
      gte: new Date('2026-10-01T06:00:00.000Z'),
      lt: new Date('2026-11-01T06:00:00.000Z'),
    };
    expect(repository.countByStatusAndPriority).toHaveBeenCalledWith(period);
    expect(repository.resolutionTimes).toHaveBeenCalledWith(period);
  });

  it('promedia el tiempo de resolución en días con un decimal', async () => {
    const created = new Date('2026-11-01T12:00:00Z');
    const { service } = setup({
      resolutionTimes: vi.fn().mockResolvedValue([
        {
          createdAt: created,
          resolvedAt: new Date(created.getTime() + 2 * DAY_MS),
        },
        {
          createdAt: created,
          resolvedAt: new Date(created.getTime() + 3 * DAY_MS),
        },
        {
          createdAt: created,
          resolvedAt: new Date(created.getTime() + 0.25 * DAY_MS),
        },
      ]),
    });

    const report = await service.getReport(query(), NOW);
    // (2 + 3 + 0.25) / 3 = 1.75 → 1.8
    expect(report.avgResolutionDays).toBe(1.8);
  });

  it('sin resueltas en el periodo, el promedio es null ("Sin datos")', async () => {
    const { service } = setup();
    const report = await service.getReport(query(), NOW);
    expect(report.avgResolutionDays).toBeNull();
  });

  it('la lista de más de 7 días no usa el periodo: corta en hoy − 7 días', async () => {
    const { service, repository } = setup();
    await service.getReport(
      query({ from: '2026-01-01', to: '2026-01-31', page: 2, pageSize: 10 }),
      NOW,
    );
    // Inicio del 1 de noviembre en El Salvador: creada el 31 de octubre o antes.
    expect(repository.staleOpen).toHaveBeenCalledWith(
      new Date('2026-11-01T06:00:00.000Z'),
      2,
      10,
    );
  });

  it('calcula los días abierta en el calendario del condominio', async () => {
    const { service } = setup({
      staleOpen: vi.fn().mockResolvedValue({
        rows: [
          // 31 oct a las 23:30 en El Salvador (1 nov 05:30 UTC): 8 días.
          staleRow('INC-2026-00002', '2026-11-01T05:30:00Z', 'Juan Pérez'),
          staleRow('INC-2026-00001', '2026-10-20T15:00:00Z'),
        ],
        total: 2,
      }),
    });

    const report = await service.getReport(query(), NOW);

    expect(report.stale).toEqual({
      data: [
        {
          number: 'INC-2026-00002',
          title: 'Incidencia INC-2026-00002',
          unitCode: 'A-101',
          status: IncidentStatus.PENDIENTE,
          priority: IncidentPriority.ALTA,
          assignee: 'Juan Pérez',
          daysOpen: 8,
        },
        expect.objectContaining({
          number: 'INC-2026-00001',
          assignee: null,
          daysOpen: 19,
        }),
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });
  });
});
