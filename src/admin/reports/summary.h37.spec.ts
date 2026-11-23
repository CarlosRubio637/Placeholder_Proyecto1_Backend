// El handler del controlador se pasa sin llamarlo: RolesGuard lee su metadata
// @Roles.
/* oxlint-disable typescript/unbound-method */
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { AreasUsageService } from './areas-usage.service.js';
import type { AreasUsageRepository } from './areas-usage.repository.js';
import type { DelinquencyRepository } from './delinquency.repository.js';
import { DelinquencyService } from './delinquency.service.js';
import type { IncidentsReportRepository } from './incidents-report.repository.js';
import { IncidentsReportService } from './incidents-report.service.js';
import type { ParticipationReportRepository } from './participation-report.repository.js';
import { ParticipationReportService } from './participation-report.service.js';
import { ReportsController } from './reports.controller.js';
import { SummaryService } from './summary.service.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');

const closedAssembly = {
  id: 'as-1',
  title: 'Asamblea de noviembre',
  status: 'CERRADA',
  openedAt: new Date('2026-11-05T15:00:00Z'),
  _count: { eligibleUnits: 24 },
  topics: [
    { question: 'Uno', _count: { voteParticipations: 18 } },
    { question: 'Dos', _count: { voteParticipations: 12 } },
  ],
};

/**
 * El resumen con los servicios reales de H32 a H35; solo se simulan sus
 * repositorios. Así cada tarjeta usa el mismo cálculo que su reporte.
 */
function setup(
  options: {
    areas?: { id: string; name: string; openTime: string; closeTime: string }[];
    lastClosed?: object | null;
  } = {},
) {
  const delinquencyRepo = {
    owedAmount: vi.fn().mockResolvedValue(1275.5),
    overdueUnitIds: vi.fn().mockResolvedValue(['u-1', 'u-2']),
    countActiveUnits: vi.fn((ids?: string[]) => Promise.resolve(ids ? 2 : 40)),
    unitDebts: vi.fn().mockResolvedValue([]),
  };
  const areasRepo = {
    activeAreas: vi.fn().mockResolvedValue(
      options.areas ?? [
        { id: 'a-1', name: 'Piscina', openTime: '08:00', closeTime: '20:00' },
        { id: 'a-2', name: 'Gimnasio', openTime: '08:00', closeTime: '20:00' },
      ],
    ),
    reservations: vi
      .fn()
      .mockResolvedValue([
        {
          areaId: 'a-1',
          status: 'CONFIRMADA',
          startTime: '08:00',
          endTime: '20:00',
        },
      ]),
    blocks: vi.fn().mockResolvedValue([]),
  };
  const incidentsRepo = {
    countOpen: vi.fn().mockResolvedValue(9),
    staleOpen: vi.fn().mockResolvedValue({ rows: [], total: 3 }),
  };
  const participationRepo = {
    lastClosed: vi
      .fn()
      .mockResolvedValue(
        options.lastClosed === undefined ? closedAssembly : options.lastClosed,
      ),
  };
  const delinquency = new DelinquencyService(
    delinquencyRepo as unknown as DelinquencyRepository,
  );
  const areas = new AreasUsageService(
    areasRepo as unknown as AreasUsageRepository,
  );
  const incidents = new IncidentsReportService(
    incidentsRepo as unknown as IncidentsReportRepository,
  );
  const participation = new ParticipationReportService(
    participationRepo as unknown as ParticipationReportRepository,
  );
  const service = new SummaryService(
    delinquency,
    areas,
    incidents,
    participation,
  );
  return {
    service,
    delinquency,
    areas,
    delinquencyRepo,
    areasRepo,
    incidentsRepo,
    participationRepo,
  };
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => ReportsController.prototype.getSummary,
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H37. Resumen "de un vistazo" para la administración', () => {
  it('AC1: devuelve las cuatro tarjetas con sus cifras', async () => {
    const { service } = setup();

    const summary = await service.getSummary(NOW);

    expect(summary).toEqual({
      debt: { owedAmount: 1275.5, overduePct: 5 },
      areas: {
        avgOccupancyPct: 2.3,
        mostUsed: { areaId: 'a-1', name: 'Piscina' },
      },
      incidents: { openTotal: 9, staleCount: 3 },
      voting: {
        assemblyTitle: 'Asamblea de noviembre',
        avgParticipationPct: 62.5,
      },
      generatedAt: NOW,
    });
  });

  it('AC3: incluye la hora de generación para "Última actualización"', async () => {
    const { service } = setup();

    expect((await service.getSummary(NOW)).generatedAt).toBe(NOW);
  });

  it('AC3: sin asambleas cerradas ni áreas habilitadas, esas tarjetas vienen en null ("Sin datos")', async () => {
    const { service } = setup({ areas: [], lastClosed: null });

    const summary = await service.getSummary(NOW);

    expect(summary.voting).toBeNull();
    expect(summary.areas).toEqual({ avgOccupancyPct: null, mostUsed: null });
  });

  it('AC4: la morosidad usa el servicio de H32 con sus últimos 12 meses', async () => {
    const { service, delinquency, delinquencyRepo } = setup();
    const getReport = vi.spyOn(delinquency, 'getReport');

    await service.getSummary(NOW);

    expect(getReport).toHaveBeenCalledWith({ page: 1, pageSize: 1 }, NOW);
    expect(delinquencyRepo.owedAmount).toHaveBeenCalledWith({
      from: '2025-11-22',
      to: '2026-11-22',
    });
  });

  it('AC4: las áreas usan el servicio de H33 con el mes actual y la ocupación promedio es el promedio simple', async () => {
    const { service, areas, areasRepo } = setup();
    const getReport = vi.spyOn(areas, 'getReport');

    const summary = await service.getSummary(NOW);

    expect(getReport).toHaveBeenCalledWith({}, NOW);
    expect(areasRepo.reservations).toHaveBeenCalledWith(['a-1', 'a-2'], {
      from: '2026-11-01',
      to: '2026-11-22',
    });
    // Piscina con 12 de 264 horas (4.5 %) y Gimnasio sin reservas (0 %): (4.5 + 0) / 2.
    expect(summary.areas.avgOccupancyPct).toBe(2.3);
  });

  it('AC4: las incidencias usan la regla de "más de 7 días" de H34 sobre las abiertas de hoy', async () => {
    const { service, incidentsRepo } = setup();

    await service.getSummary(NOW);

    expect(incidentsRepo.countOpen).toHaveBeenCalled();
    expect(incidentsRepo.staleOpen).toHaveBeenCalledWith(
      // Creadas a más tardar el 14 de noviembre (hoy − 8), hora de El Salvador.
      new Date('2026-11-15T06:00:00.000Z'),
      1,
      1,
    );
  });

  it('AC4: las votaciones usan la fórmula de H35 sobre la última asamblea cerrada', async () => {
    const { service, participationRepo } = setup();

    const summary = await service.getSummary(NOW);

    expect(participationRepo.lastClosed).toHaveBeenCalled();
    // (18 / 24 + 12 / 24) / 2 × 100 = 62.5
    expect(summary.voting?.avgParticipationPct).toBe(62.5);
  });

  it('AC5: el servidor calcula las cuatro tarjetas en una sola respuesta', async () => {
    const summary = { debt: {}, areas: {}, incidents: {}, voting: null };
    const service = { getSummary: vi.fn().mockResolvedValue(summary) };
    const controller = new ReportsController(
      {} as DelinquencyService,
      {} as IncidentsReportService,
      {} as AreasUsageService,
      {} as ParticipationReportService,
      service as unknown as SummaryService,
    );

    expect(await controller.getSummary()).toBe(summary);
    expect(service.getSummary).toHaveBeenCalledTimes(1);
  });

  it.each(['RESIDENTE', 'SEGURIDAD'] as const)(
    'AC6: %s recibe 403 en el resumen',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        'No tienes permiso para esta acción.',
      );
    },
  );

  it('AC6: el Administrador sí consulta el resumen', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
