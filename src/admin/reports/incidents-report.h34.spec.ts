// El handler del controlador se pasa sin llamarlo: RolesGuard lee su metadata
// @Roles.
/* oxlint-disable typescript/unbound-method */
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { PrismaService } from '@Prisma/services';
import type { IncidentPriority, IncidentStatus, Role } from '@PrismaClient';
import { IncidentsReportRepository } from './incidents-report.repository.js';
import { IncidentsReportService } from './incidents-report.service.js';
import { ReportsController } from './reports.controller.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const query = { from: '2026-11-01', to: '2026-11-20', page: 1, pageSize: 20 };

type Group = {
  status: IncidentStatus;
  priority: IncidentPriority;
  _count: { _all: number };
};
type FindManyArgs = { select: Record<string, unknown> };

const group = (
  status: IncidentStatus,
  priority: IncidentPriority,
  count: number,
): Group => ({ status, priority, _count: { _all: count } });

/** Servicio y repositorio reales sobre un Prisma simulado. */
function setup(
  data: {
    groups?: Group[];
    resolutions?: { createdAt: Date; resolvedAt: Date }[];
    stale?: object[];
    staleTotal?: number;
  } = {},
) {
  const prisma = {
    incident: {
      groupBy: vi.fn().mockResolvedValue(data.groups ?? []),
      findMany: vi.fn((args: FindManyArgs) =>
        Promise.resolve(
          'number' in args.select
            ? (data.stale ?? [])
            : (data.resolutions ?? []),
        ),
      ),
      count: vi.fn().mockResolvedValue(data.staleTotal ?? 0),
    },
  };
  const service = new IncidentsReportService(
    new IncidentsReportRepository(prisma as unknown as PrismaService),
  );
  return { prisma, service };
}

/** Los argumentos de una llamada a findMany según lo que selecciona. */
function findManyCall(
  prisma: ReturnType<typeof setup>['prisma'],
  kind: 'stale' | 'resolutions',
) {
  return prisma.incident.findMany.mock.calls
    .map(([args]) => args as FindManyArgs & { where: object })
    .find((args) => 'number' in args.select === (kind === 'stale'));
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => ReportsController.prototype.getIncidents,
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H34. Reporte de incidencias abiertas', () => {
  it('AC1: la tabla cruzada trae siempre las 9 combinaciones de estado y prioridad', async () => {
    const { service } = setup({ groups: [group('PENDIENTE', 'ALTA', 2)] });

    const { matrix } = await service.getReport(query, NOW);

    expect(matrix).toHaveLength(9);
    expect(matrix).toContainEqual({
      status: 'PENDIENTE',
      priority: 'ALTA',
      count: 2,
    });
    expect(matrix).toContainEqual({
      status: 'RESUELTO',
      priority: 'BAJA',
      count: 0,
    });
  });

  it('AC3: lista las abiertas con más de 7 días, de la más antigua a la más reciente, con sus días abierta', async () => {
    const { prisma, service } = setup({
      stale: [
        {
          number: 'INC-2026-00001',
          title: 'Fuga en el lobby',
          status: 'PENDIENTE',
          priority: 'ALTA',
          createdAt: new Date('2026-11-02T15:00:00Z'),
          unit: { code: 'A-101' },
          assignee: null,
        },
      ],
      staleTotal: 1,
    });

    const { stale } = await service.getReport(query, NOW);

    expect(findManyCall(prisma, 'stale')).toMatchObject({
      orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(stale.data[0]).toEqual({
      number: 'INC-2026-00001',
      title: 'Fuga en el lobby',
      unitCode: 'A-101',
      status: 'PENDIENTE',
      priority: 'ALTA',
      assignee: null,
      daysOpen: 20,
    });
  });

  it('AC5: abiertas son las Pendiente y En proceso creadas en el periodo, según su estado actual', async () => {
    const { prisma, service } = setup({
      groups: [
        group('PENDIENTE', 'ALTA', 2),
        group('EN_PROCESO', 'MEDIA', 3),
        group('RESUELTO', 'BAJA', 4),
      ],
    });

    const report = await service.getReport(query, NOW);

    expect(report.openTotal).toBe(5);
    expect(prisma.incident.groupBy).toHaveBeenCalledWith({
      by: ['status', 'priority'],
      where: {
        createdAt: {
          // Del inicio del 1 de noviembre al inicio del 21, hora de El Salvador.
          gte: new Date('2026-11-01T06:00:00.000Z'),
          lt: new Date('2026-11-21T06:00:00.000Z'),
        },
      },
      _count: { _all: true },
    });
  });

  it('AC6: el tiempo promedio de resolución es en días con un decimal', async () => {
    const created = new Date('2026-11-05T15:00:00Z');
    const { service } = setup({
      resolutions: [
        {
          createdAt: created,
          resolvedAt: new Date(created.getTime() + 2 * DAY),
        },
        {
          createdAt: created,
          resolvedAt: new Date(created.getTime() + 3.25 * DAY),
        },
      ],
    });

    const report = await service.getReport(query, NOW);

    // (2 + 3.25) / 2 = 2.625 días.
    expect(report.avgResolutionDays).toBe(2.6);
  });

  it('AC6: solo toma las Resuelto cuya última resolución está en el periodo', async () => {
    const { prisma, service } = setup();

    await service.getReport(query, NOW);

    // Una reabierta tiene resolvedAt nulo (H13): no entra hasta que se vuelve a resolver.
    expect(findManyCall(prisma, 'resolutions')?.where).toEqual({
      status: 'RESUELTO',
      resolvedAt: {
        gte: new Date('2026-11-01T06:00:00.000Z'),
        lt: new Date('2026-11-21T06:00:00.000Z'),
      },
    });
  });

  it('AC6: sin resueltas en el periodo el promedio es null ("Sin datos")', async () => {
    const { service } = setup();

    expect((await service.getReport(query, NOW)).avgResolutionDays).toBeNull();
  });

  it('AC7: la lista de más de 7 días incluye todas las abiertas de hoy, sin aplicar el periodo', async () => {
    const { prisma, service } = setup();

    await service.getReport(query, NOW);

    expect(findManyCall(prisma, 'stale')?.where).toEqual({
      status: { in: ['PENDIENTE', 'EN_PROCESO'] },
      // Creadas a más tardar el 14 de noviembre (hoy − 8), hora de El Salvador.
      createdAt: { lt: new Date('2026-11-15T06:00:00.000Z') },
    });
  });

  it('AC8: las cifras salen del modelo Incident del Módulo 3', async () => {
    const { prisma, service } = setup();

    await service.getReport(query, NOW);

    expect(prisma.incident.groupBy).toHaveBeenCalled();
    expect(prisma.incident.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.incident.count).toHaveBeenCalled();
  });

  it.each(['RESIDENTE', 'SEGURIDAD'] as const)(
    'AC8: %s recibe 403 en el reporte',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        'No tienes permiso para esta acción.',
      );
    },
  );

  it('AC8: el Administrador sí consulta el reporte', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
