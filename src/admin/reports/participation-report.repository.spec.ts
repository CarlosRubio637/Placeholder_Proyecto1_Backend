import { AssemblyStatus } from '@PrismaClient';
import type { PrismaService } from '../../prisma/services/index.js';
import { ParticipationReportRepository } from './participation-report.repository.js';

function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  const count = vi.fn().mockResolvedValue(0);
  const repository = new ParticipationReportRepository({
    assembly: { findMany, count },
  } as unknown as PrismaService);
  return { repository, findMany, count };
}

const range = {
  gte: new Date('2025-11-19T06:00:00Z'),
  lt: new Date('2026-11-20T06:00:00Z'),
};

describe('ParticipationReportRepository.assemblies', () => {
  it('solo Abiertas y Cerradas abiertas en el periodo, la más reciente primero', async () => {
    const { repository, findMany, count } = setup();

    await repository.assemblies({ openedAt: range }, 3, 10);

    const where = {
      status: { in: [AssemblyStatus.ABIERTA, AssemblyStatus.CERRADA] },
      openedAt: range,
    };
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 10,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('con una asamblea filtra por id y sigue excluyendo las Programadas', async () => {
    const { repository, findMany } = setup();

    await repository.assemblies({ assemblyId: 'as-1' }, 1, 10);

    expect(findMany.mock.calls[0][0].where).toEqual({
      status: { in: [AssemblyStatus.ABIERTA, AssemblyStatus.CERRADA] },
      id: 'as-1',
    });
  });

  it('no lee los votos ni las opciones (el voto es secreto)', async () => {
    const { repository, findMany } = setup();

    await repository.assemblies({ openedAt: range }, 1, 10);

    const select = JSON.stringify(findMany.mock.calls[0][0].select);
    expect(select).not.toMatch(/ballot|option|result/i);
    expect(select).toContain('voteParticipations');
  });
});
