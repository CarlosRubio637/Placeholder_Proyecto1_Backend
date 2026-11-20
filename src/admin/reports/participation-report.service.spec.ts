import { BadRequestException } from '@nestjs/common';
import { condominiumDayStart } from '@Common/time';
import { AssemblyStatus } from '@PrismaClient';
import { PARTICIPATION_MESSAGES } from './participation-report.constants.js';
import type {
  AssemblyRow,
  ParticipationReportRepository,
} from './participation-report.repository.js';
import {
  ParticipationReportService,
  monthsBefore,
} from './participation-report.service.js';

// Jueves 19 de noviembre de 2026, 10:00 en El Salvador.
const NOW = new Date('2026-11-19T16:00:00Z');
const TODAY = '2026-11-19';
const UUID = '3f0b6a3e-8d55-4c5b-9a3e-2b1f6f7d9c10';

function setup(rows: AssemblyRow[] = [], total = rows.length) {
  const repository = {
    assemblies: vi.fn().mockResolvedValue({ rows, total }),
  };
  const service = new ParticipationReportService(
    repository as unknown as ParticipationReportRepository,
  );
  return { service, repository };
}

const query = (extra: Record<string, unknown> = {}) => ({
  page: 1,
  pageSize: 10,
  ...extra,
});

function assembly(
  eligibleUnits: number,
  votes: number[],
  extra: Partial<AssemblyRow> = {},
): AssemblyRow {
  return {
    id: 'as-1',
    title: 'Asamblea ordinaria',
    status: AssemblyStatus.CERRADA,
    openedAt: new Date('2026-11-02T15:00:00Z'),
    _count: { eligibleUnits },
    topics: votes.map((voted, index) => ({
      question: `Tema ${index + 1}`,
      _count: { voteParticipations: voted },
    })),
    ...extra,
  };
}

async function expectBadRequest(promise: Promise<unknown>, message: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toMatchObject({
    field: 'to',
    message: [message],
  });
}

describe('monthsBefore', () => {
  it.each([
    ['2026-11-19', 12, '2025-11-19'],
    ['2026-03-31', 1, '2026-02-28'], // el 31 de febrero no existe
    ['2024-02-29', 12, '2023-02-28'], // año bisiesto
    ['2026-01-15', 2, '2025-11-15'], // cruza el año
  ])('%s − %i meses = %s', (date, months, expected) => {
    expect(monthsBefore(date, months)).toBe(expected);
  });
});

describe('ParticipationReportService.resolvePeriod', () => {
  const { service } = setup();

  it('sin fechas va de hoy − 12 meses a hoy', () => {
    expect(service.resolvePeriod({}, TODAY)).toEqual({
      from: '2025-11-19',
      to: TODAY,
    });
  });

  it('con solo `to`, empieza 12 meses antes de esa fecha', () => {
    expect(service.resolvePeriod({ to: '2026-06-30' }, TODAY)).toEqual({
      from: '2025-06-30',
      to: '2026-06-30',
    });
  });

  it('rechaza un fin anterior al inicio (400 en `to`)', async () => {
    await expectBadRequest(
      service.getReport(query({ from: TODAY, to: '2026-11-18' }), NOW),
      PARTICIPATION_MESSAGES.endBeforeStart,
    );
  });

  it('rechaza más de 366 días (400 en `to`)', async () => {
    await expectBadRequest(
      service.getReport(query({ from: '2025-11-17', to: TODAY }), NOW),
      PARTICIPATION_MESSAGES.rangeTooLong,
    );
  });
});

describe('ParticipationReportService.getReport', () => {
  it('filtra por la apertura en el periodo, en días del condominio', async () => {
    const { service, repository } = setup();

    await service.getReport(
      query({ from: '2026-11-01', to: '2026-11-19', page: 2, pageSize: 5 }),
      NOW,
    );

    expect(repository.assemblies).toHaveBeenCalledWith(
      {
        openedAt: {
          gte: condominiumDayStart('2026-11-01'),
          lt: condominiumDayStart('2026-11-20'),
        },
      },
      2,
      5,
    );
  });

  it('con `assemblyId` trae solo esa asamblea y no aplica las fechas', async () => {
    const { service, repository } = setup();

    await service.getReport(query({ assemblyId: UUID }), NOW);

    expect(repository.assemblies).toHaveBeenCalledWith(
      { assemblyId: UUID },
      1,
      10,
    );
  });

  it('calcula la participación por tema y el promedio de la asamblea', async () => {
    const { service } = setup([assembly(24, [18, 12, 0])], 7);

    const report = await service.getReport(query({ page: 1 }), NOW);

    expect(report).toMatchObject({ total: 7, page: 1, pageSize: 10 });
    expect(report.data).toEqual([
      {
        assemblyId: 'as-1',
        title: 'Asamblea ordinaria',
        status: AssemblyStatus.CERRADA,
        openedAt: new Date('2026-11-02T15:00:00Z'),
        avgParticipationPct: 41.7, // (75 + 50 + 0) / 3 = 41.66…
        topics: [
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
          {
            question: 'Tema 3',
            votedUnits: 0,
            eligibleUnits: 24,
            participationPct: 0,
          },
        ],
      },
    ]);
  });

  it('redondea a un decimal: 1 de 3 es 33.3 %', async () => {
    const { service } = setup([assembly(3, [1, 1])]);

    const [row] = (await service.getReport(query(), NOW)).data;
    expect(row.topics.map((t) => t.participationPct)).toEqual([33.3, 33.3]);
    expect(row.avgParticipationPct).toBe(33.3);
  });

  it('el promedio se calcula sin redondear los temas antes', async () => {
    // 2/3 = 66.66… % y 0/3 = 0 %: el promedio exacto es 33.33… → 33.3.
    // Promediando los temas ya redondeados (66.7 y 0) daría 33.35 → 33.4.
    const { service } = setup([assembly(3, [2, 0])]);

    const [row] = (await service.getReport(query(), NOW)).data;
    expect(row.topics.map((t) => t.participationPct)).toEqual([66.7, 0]);
    expect(row.avgParticipationPct).toBe(33.3);
  });

  it('sin unidades habilitadas la participación es 0', async () => {
    const { service } = setup([assembly(0, [0, 0])]);

    const [row] = (await service.getReport(query(), NOW)).data;
    expect(row.avgParticipationPct).toBe(0);
    expect(row.topics.every((t) => t.participationPct === 0)).toBe(true);
  });

  it('nunca devuelve opciones ni votos por opción', async () => {
    const { service } = setup([assembly(10, [4])]);

    const [row] = (await service.getReport(query(), NOW)).data;
    expect(Object.keys(row.topics[0]).sort()).toEqual([
      'eligibleUnits',
      'participationPct',
      'question',
      'votedUnits',
    ]);
  });
});
