import type { AreasUsageService } from './areas-usage.service.js';
import type { DelinquencyService } from './delinquency.service.js';
import type { IncidentsReportService } from './incidents-report.service.js';
import type { ParticipationReportService } from './participation-report.service.js';
import { SummaryService } from './summary.service.js';

// Viernes 20 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-20T16:00:00Z');

const area = (name: string, occupancyPct: number, confirmed = 1) => ({
  areaId: name,
  name,
  confirmed,
  cancelled: 0,
  reservedHours: 0,
  enabledHours: 0,
  occupancyPct,
});

function setup(
  options: {
    areas?: ReturnType<typeof area>[];
    mostUsed?: { areaId: string; name: string } | null;
    lastClosed?: { title: string; avgParticipationPct: number } | null;
  } = {},
) {
  const delinquency = {
    getReport: vi.fn().mockResolvedValue({
      summary: {
        owedAmount: 1275.5,
        overdueUnits: 6,
        overdueActiveUnits: 5,
        activeUnits: 40,
        overduePct: 12.5,
      },
      data: [],
      total: 6,
      page: 1,
      pageSize: 1,
    }),
  };
  const areas = {
    getReport: vi.fn().mockResolvedValue({
      data: options.areas ?? [],
      mostUsed: options.mostUsed ?? null,
      leastUsed: null,
    }),
  };
  const incidents = {
    openSummary: vi.fn().mockResolvedValue({ openTotal: 9, staleCount: 3 }),
  };
  const participation = {
    lastClosed: vi.fn().mockResolvedValue(options.lastClosed ?? null),
  };
  const service = new SummaryService(
    delinquency as unknown as DelinquencyService,
    areas as unknown as AreasUsageService,
    incidents as unknown as IncidentsReportService,
    participation as unknown as ParticipationReportService,
  );
  return { service, delinquency, areas, incidents, participation };
}

describe('H37. Resumen "de un vistazo" para la administración', () => {
  it('AC1: calcula las cuatro tarjetas en una sola respuesta', async () => {
    const { service } = setup({
      areas: [area('Piscina', 40), area('Salón', 10)],
      mostUsed: { areaId: 'Piscina', name: 'Piscina' },
      lastClosed: { title: 'Asamblea de noviembre', avgParticipationPct: 62.5 },
    });

    expect(await service.getSummary(NOW)).toEqual({
      debt: { owedAmount: 1275.5, overduePct: 12.5 },
      areas: {
        avgOccupancyPct: 25,
        mostUsed: { areaId: 'Piscina', name: 'Piscina' },
      },
      incidents: { openTotal: 9, staleCount: 3 },
      voting: {
        assemblyTitle: 'Asamblea de noviembre',
        avgParticipationPct: 62.5,
      },
      generatedAt: NOW,
    });
  });

  it('AC2: usa los servicios de cada reporte con el periodo de su tarjeta', async () => {
    const { service, delinquency, areas, incidents, participation } = setup();

    await service.getSummary(NOW);

    // Sin fechas: últimos 12 meses (H32) y mes actual (H33).
    expect(delinquency.getReport).toHaveBeenCalledWith(
      { page: 1, pageSize: 1 },
      NOW,
    );
    expect(areas.getReport).toHaveBeenCalledWith({}, NOW);
    expect(incidents.openSummary).toHaveBeenCalledWith(NOW);
    expect(participation.lastClosed).toHaveBeenCalled();
  });

  it('AC3: la ocupación promedio es el promedio simple de las áreas habilitadas, un decimal', async () => {
    const { service } = setup({
      areas: [area('A', 10), area('B', 20.5), area('C', 0, 0)],
    });
    const { areas } = await service.getSummary(NOW);
    // (10 + 20.5 + 0) / 3 = 10.1666…
    expect(areas.avgOccupancyPct).toBe(10.2);
  });

  it('AC4: sin áreas habilitadas ni asambleas cerradas, esas tarjetas quedan en "Sin datos" (null)', async () => {
    const { service } = setup();
    const summary = await service.getSummary(NOW);
    expect(summary.areas).toEqual({ avgOccupancyPct: null, mostUsed: null });
    expect(summary.voting).toBeNull();
  });
});
