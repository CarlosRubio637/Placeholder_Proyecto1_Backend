// El handler del controlador se pasa sin llamarlo: RolesGuard lee su metadata
// @Roles.
/* oxlint-disable typescript/unbound-method */
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { PrismaService } from '@Prisma/services';
import type { Role } from '@PrismaClient';
import { PARTICIPATION_PAGE_SIZE } from './participation-report.constants.js';
import { ParticipationReportRepository } from './participation-report.repository.js';
import { ParticipationReportService } from './participation-report.service.js';
import { ReportsController } from './reports.controller.js';

// Domingo 22 de noviembre de 2026, 12:00 en El Salvador.
const NOW = new Date('2026-11-22T18:00:00Z');
const ASSEMBLY_ID = '5b1b7e0e-6c1f-4a8e-9a43-0f1d3a2b7c9d';

/** Una asamblea como la lee el repositorio: conteos, nunca votos individuales. */
const row = (eligible: number, voted: number[]) => ({
  id: ASSEMBLY_ID,
  title: 'Asamblea de noviembre',
  status: 'CERRADA',
  openedAt: new Date('2026-11-05T15:00:00Z'),
  _count: { eligibleUnits: eligible },
  topics: voted.map((count, index) => ({
    question: `Tema ${index + 1}`,
    _count: { voteParticipations: count },
  })),
});

/** Servicio y repositorio reales sobre un Prisma simulado. */
function setup(rows: object[] = [row(24, [18, 12])], total = rows.length) {
  const prisma = {
    assembly: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
  };
  const service = new ParticipationReportService(
    new ParticipationReportRepository(prisma as unknown as PrismaService),
  );
  return { prisma, service };
}

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
  orderBy: unknown;
  skip: number;
  take: number;
};

const findManyArgs = (prisma: ReturnType<typeof setup>['prisma']) =>
  prisma.assembly.findMany.mock.calls[0][0] as FindManyArgs;

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => ReportsController.prototype.getParticipation,
    getClass: () => ReportsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H35. Reporte de participación en votaciones', () => {
  it('AC1: por cada tema devuelve las unidades que votaron, las habilitadas y el porcentaje, y el promedio por asamblea', async () => {
    const { service } = setup();

    const [assembly] = (await service.getReport({ page: 1, pageSize: 10 }, NOW))
      .data;

    expect(assembly.topics).toEqual([
      {
        question: 'Tema 1',
        votedUnits: 18,
        eligibleUnits: 24,
        participationPct: 75,
      },
      {
        question: 'Tema 2',
        votedUnits: 12,
        eligibleUnits: 24,
        participationPct: 50,
      },
    ]);
    expect(assembly.avgParticipationPct).toBe(62.5);
  });

  it('AC2: sin filtros toma las abiertas en los últimos 12 meses, la apertura más reciente primero, 10 por página', async () => {
    const { prisma, service } = setup();

    await service.getReport(
      { page: 2, pageSize: PARTICIPATION_PAGE_SIZE },
      NOW,
    );

    const args = findManyArgs(prisma);
    expect(PARTICIPATION_PAGE_SIZE).toBe(10);
    expect(args.where.openedAt).toEqual({
      gte: new Date('2025-11-22T06:00:00.000Z'),
      lt: new Date('2026-11-23T06:00:00.000Z'),
    });
    expect(args.orderBy).toEqual([{ openedAt: 'desc' }, { id: 'desc' }]);
    expect(args).toMatchObject({ skip: 10, take: 10 });
  });

  it('AC2: con una asamblea elegida filtra por ella y no aplica las fechas', async () => {
    const { prisma, service } = setup();

    await service.getReport(
      {
        assemblyId: ASSEMBLY_ID,
        from: '2026-01-01',
        to: '2026-01-31',
        page: 1,
        pageSize: 10,
      },
      NOW,
    );

    const { where } = findManyArgs(prisma);
    expect(where.id).toBe(ASSEMBLY_ID);
    expect(where).not.toHaveProperty('openedAt');
  });

  it('AC4: la participación es votaron entre habilitadas, por 100, con un decimal', async () => {
    const { service } = setup([row(3, [1])]);

    const [assembly] = (await service.getReport({ page: 1, pageSize: 10 }, NOW))
      .data;

    // 1 / 3 × 100 = 33.33…
    expect(assembly.topics[0].participationPct).toBe(33.3);
  });

  it('AC4: el promedio por asamblea es el promedio simple de sus temas, redondeado al final', async () => {
    const { service } = setup([row(3, [0, 2, 2])]);

    const [assembly] = (await service.getReport({ page: 1, pageSize: 10 }, NOW))
      .data;
    // (0 + 66.66… + 66.66…) / 3 = 44.44…; promediando los porcentajes ya
    // redondeados (0 + 66.7 + 66.7) daría 44.5.
    expect(assembly.avgParticipationPct).toBe(44.4);
  });

  it('AC4: un tema sin unidades habilitadas tiene 0 de participación', async () => {
    const { service } = setup([row(0, [0])]);

    const [assembly] = (await service.getReport({ page: 1, pageSize: 10 }, NOW))
      .data;

    expect(assembly.topics[0].participationPct).toBe(0);
    expect(assembly.avgParticipationPct).toBe(0);
  });

  it('AC5: solo entran las asambleas Abiertas y Cerradas; las Programadas no', async () => {
    const { prisma, service } = setup();

    await service.getReport({ page: 1, pageSize: 10 }, NOW);

    expect(findManyArgs(prisma).where.status).toEqual({
      in: ['ABIERTA', 'CERRADA'],
    });
  });

  it('AC5: las cifras salen de las unidades habilitadas (H22) y de la participación del tema (H23)', async () => {
    const { prisma, service } = setup();

    await service.getReport({ page: 1, pageSize: 10 }, NOW);

    expect(findManyArgs(prisma).select).toMatchObject({
      _count: { select: { eligibleUnits: true } },
      topics: {
        select: { _count: { select: { voteParticipations: true } } },
      },
    });
  });

  it('AC6: nunca lee qué opción eligió cada unidad: no consulta los votos (Ballot)', async () => {
    const { prisma, service } = setup();

    const report = await service.getReport({ page: 1, pageSize: 10 }, NOW);

    const select = JSON.stringify(findManyArgs(prisma).select);
    expect(select).not.toContain('ballots');
    expect(select).not.toContain('options');
    expect(JSON.stringify(report)).not.toMatch(/optionId|ballot/i);
  });

  it.each(['RESIDENTE', 'SEGURIDAD'] as const)(
    'AC6: %s recibe 403 en el reporte',
    (role) => {
      const guard = new RolesGuard(new Reflector());
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        'No tienes permiso para esta acción.',
      );
    },
  );

  it('AC6: el Administrador sí consulta el reporte', () => {
    const guard = new RolesGuard(new Reflector());
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
