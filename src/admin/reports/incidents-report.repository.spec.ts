import type { PrismaService } from '@Prisma/services';
import { IncidentPriority, IncidentStatus } from '@PrismaClient';
import { IncidentsReportRepository } from './incidents-report.repository.js';

const PERIOD = {
  gte: new Date('2026-11-01T06:00:00.000Z'),
  lt: new Date('2026-11-09T06:00:00.000Z'),
};

function setup() {
  const incident = {
    groupBy: vi.fn().mockResolvedValue([]),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  };
  const repository = new IncidentsReportRepository({
    incident,
  } as unknown as PrismaService);
  return { repository, incident };
}

describe('consultas del reporte de incidencias', () => {
  it('agrupa por estado y prioridad las creadas en el periodo', async () => {
    const { repository, incident } = setup();
    incident.groupBy.mockResolvedValue([
      {
        status: IncidentStatus.PENDIENTE,
        priority: IncidentPriority.ALTA,
        _count: { _all: 3 },
      },
    ]);

    await expect(repository.countByStatusAndPriority(PERIOD)).resolves.toEqual([
      {
        status: IncidentStatus.PENDIENTE,
        priority: IncidentPriority.ALTA,
        count: 3,
      },
    ]);
    expect(incident.groupBy).toHaveBeenCalledWith({
      by: ['status', 'priority'],
      where: { createdAt: PERIOD },
      _count: { _all: true },
    });
  });

  it('toma solo las Resuelto con resolvedAt en el periodo', async () => {
    const { repository, incident } = setup();
    await repository.resolutionTimes(PERIOD);
    expect(incident.findMany).toHaveBeenCalledWith({
      where: { status: IncidentStatus.RESUELTO, resolvedAt: PERIOD },
      select: { createdAt: true, resolvedAt: true },
    });
  });

  it('lista las abiertas antiguas paginadas, la más antigua primero', async () => {
    const { repository, incident } = setup();
    incident.count.mockResolvedValue(25);
    const before = new Date('2026-11-01T06:00:00.000Z');

    const result = await repository.staleOpen(before, 2, 20);

    const where = {
      status: { in: [IncidentStatus.PENDIENTE, IncidentStatus.EN_PROCESO] },
      createdAt: { lt: before },
    };
    expect(result.total).toBe(25);
    expect(incident.count).toHaveBeenCalledWith({ where });
    expect(incident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
        skip: 20,
        take: 20,
      }),
    );
  });
});
