import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '@Prisma/services';
import { IncidentRepository } from './incident.repository.js';

function setup() {
  const incident = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn().mockResolvedValue(null),
  };
  const incidentPhoto = { findUnique: vi.fn().mockResolvedValue(null) };
  const $transaction = vi.fn((queries: Promise<unknown>[]) =>
    Promise.all(queries),
  );
  const repository = new IncidentRepository({
    incident,
    incidentPhoto,
    $transaction,
  } as unknown as PrismaService);
  return { repository, incident, incidentPhoto };
}

/** Archivos .ts del servidor, sin pruebas ni el cliente generado. */
function sourceFiles(dir = join(process.cwd(), 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'generated' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

describe('H11. Mis incidencias y detalle con historial', () => {
  it('AC1: la lista trae número, título, ubicación, estado, prioridad y fecha, la más reciente primero, de 10 en 10', async () => {
    const { repository, incident } = setup();

    await repository.listByUnit({ unitId: 'unit-a101', page: 2, pageSize: 10 });

    expect(incident.findMany).toHaveBeenCalledWith({
      where: { unitId: 'unit-a101', status: undefined },
      select: {
        id: true,
        number: true,
        title: true,
        location: true,
        status: true,
        priority: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
      skip: 10,
      take: 10,
    });
  });

  it('AC2: el filtro de estado se aplica a la lista y al total', async () => {
    const { repository, incident } = setup();

    await repository.listByUnit({
      unitId: 'unit-a101',
      status: 'EN_PROCESO',
      page: 1,
      pageSize: 10,
    });

    const where = { unitId: 'unit-a101', status: 'EN_PROCESO' };
    expect(incident.findMany.mock.calls[0][0].where).toEqual(where);
    expect(incident.count).toHaveBeenCalledWith({ where });
  });

  it('AC5: la lista filtra por la unidad, no por el residente que reportó', async () => {
    const { repository, incident } = setup();

    await repository.listByUnit({ unitId: 'unit-a101', page: 1, pageSize: 10 });

    const where = incident.findMany.mock.calls[0][0].where;
    expect(where.unitId).toBe('unit-a101');
    expect(where).not.toHaveProperty('reporterId');
  });

  it('AC6: el historial del detalle va del evento más antiguo al más reciente', async () => {
    const { repository, incident } = setup();

    await repository.findDetail('inc-1');

    const { include } = incident.findUnique.mock.calls[0][0];
    expect(include.events.orderBy).toEqual([
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
    expect(include.assignee).toEqual({
      select: { id: true, name: true, specialty: true },
    });
  });

  it('AC6: ningún código modifica ni borra eventos del historial', () => {
    const writers = sourceFiles().filter((file) =>
      /\.incidentEvent\.(update|updateMany|delete|deleteMany|upsert)\b/.test(
        readFileSync(file, 'utf8'),
      ),
    );

    expect(writers).toEqual([]);
  });

  it('AC7: la foto se busca con la unidad de su incidencia para comparar con la del residente', async () => {
    const { repository, incidentPhoto } = setup();

    await repository.findPhoto('foto-1');

    expect(incidentPhoto.findUnique).toHaveBeenCalledWith({
      where: { id: 'foto-1' },
      include: { incident: { select: { unitId: true } } },
    });
  });
});
