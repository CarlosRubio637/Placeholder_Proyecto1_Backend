import type { PrismaService } from '@Prisma/services';
import { DirectoryRepository } from './directory.repository.js';

const TOWER_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';

const record = {
  email: 'residente1@condominio.test',
  unit: { code: 'A-101' },
  profile: { fullName: 'Ana Gómez', phone: '7100-0001' },
  directoryPreference: { showUnit: true, showPhone: false, showEmail: true },
};

function setup() {
  const users = {
    findMany: vi.fn().mockResolvedValue([record]),
    count: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    user: users,
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const repository = new DirectoryRepository(
    prisma as unknown as PrismaService,
  );
  return { repository, users };
}

function whereOf(users: ReturnType<typeof setup>['users']) {
  return (users.findMany.mock.calls[0][0] as { where: object }).where;
}

describe('H29. Búsqueda de contacto de vecinos', () => {
  it('AC4: solo busca residentes activos visibles en el directorio', async () => {
    const { repository, users } = setup();
    await repository.search({
      requesterId: 'user-5',
      searchName: 'gomez',
      skip: 0,
      take: 20,
    });
    expect(whereOf(users)).toMatchObject({
      role: 'RESIDENTE',
      isActive: true,
      directoryPreference: { visible: true },
      profile: { searchName: { contains: 'gomez' } },
    });
    expect(whereOf(users)).not.toHaveProperty('directoryPreference.showUnit');
  });

  it('AC5: la búsqueda por unidad exige que el vecino muestre su unidad', async () => {
    const { repository, users } = setup();
    await repository.search({
      requesterId: 'user-5',
      unit: { towerId: TOWER_ID, number: '101' },
      skip: 0,
      take: 20,
    });
    expect(whereOf(users)).toMatchObject({
      directoryPreference: { visible: true, showUnit: true },
      unit: { towerId: TOWER_ID, number: '101' },
      profile: { isNot: null },
    });
  });

  it('AC6: el propio residente no aparece en sus resultados', async () => {
    const { repository, users } = setup();
    await repository.search({
      requesterId: 'user-5',
      searchName: 'castillo',
      skip: 0,
      take: 20,
    });
    expect(whereOf(users)).toMatchObject({ id: { not: 'user-5' } });
  });
});

describe('consulta del directorio', () => {
  it('escapa los comodines de LIKE para que "%%%" no liste todo el directorio', async () => {
    const { repository, users } = setup();
    await repository.search({
      requesterId: 'user-5',
      searchName: String.raw`%_\a`,
      skip: 0,
      take: 20,
    });
    expect(whereOf(users)).toMatchObject({
      profile: { searchName: { contains: String.raw`\%\_\\a` } },
    });
  });

  it('ordena por nombre sin tildes, luego por nombre e id, y pagina', async () => {
    const { repository, users } = setup();
    await repository.search({
      requesterId: 'user-5',
      searchName: 'gomez',
      skip: 40,
      take: 20,
    });
    expect(users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { profile: { searchName: 'asc' } },
          { profile: { fullName: 'asc' } },
          { id: 'asc' },
        ],
        skip: 40,
        take: 20,
      }),
    );
    expect(users.count).toHaveBeenCalledWith({ where: whereOf(users) });
  });

  it('devuelve cada fila con sus datos y lo que el vecino comparte', async () => {
    const { repository } = setup();
    const { rows, total } = await repository.search({
      requesterId: 'user-5',
      searchName: 'gomez',
      skip: 0,
      take: 20,
    });
    expect(rows).toEqual([
      {
        fullName: 'Ana Gómez',
        unitCode: 'A-101',
        phone: '7100-0001',
        email: 'residente1@condominio.test',
        showUnit: true,
        showPhone: false,
        showEmail: true,
      },
    ]);
    expect(total).toBe(1);
  });
});
