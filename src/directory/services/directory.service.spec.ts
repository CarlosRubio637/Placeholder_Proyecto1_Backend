import { BadRequestException } from '@nestjs/common';
import type { User } from '@PrismaClient';
import { DirectoryService } from './directory.service.js';
import type { DirectoryRepository } from '../repositories/index.js';
import type { DirectorySearchQueryDto } from '../dto/index.js';

const me = { id: 'user-5', role: 'RESIDENTE' } as User;
const TOWER_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';

const ana = {
  fullName: 'Ana Gómez',
  unitCode: 'A-101',
  phone: '7100-0001',
  email: 'residente1@condominio.test',
  showUnit: true,
  showPhone: true,
  showEmail: true,
};

const luis = {
  fullName: 'Luis Gómez',
  unitCode: 'A-101',
  phone: '7100-0002',
  email: 'residente2@condominio.test',
  showUnit: false,
  showPhone: true,
  showEmail: false,
};

function query(
  overrides: Partial<DirectorySearchQueryDto> = {},
): DirectorySearchQueryDto {
  return { page: 1, pageSize: 20, ...overrides };
}

function setup() {
  const repository = {
    search: vi.fn().mockResolvedValue({ rows: [ana, luis], total: 2 }),
  };
  const service = new DirectoryService(
    repository as unknown as DirectoryRepository,
  );
  return { service, repository };
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason as BadRequestException,
  );
}

describe('H29. Búsqueda de contacto de vecinos', () => {
  it('AC4: cada resultado trae solo los campos que el vecino comparte', async () => {
    const { service } = setup();
    const page = await service.search(me, query({ name: 'Gómez' }));
    expect(page.data).toEqual([
      {
        fullName: 'Ana Gómez',
        unitCode: 'A-101',
        phone: '7100-0001',
        email: 'residente1@condominio.test',
      },
      { fullName: 'Luis Gómez', phone: '7100-0002' },
    ]);
    expect(Object.keys(page.data[1])).toEqual(['fullName', 'phone']);
  });

  it('AC6: busca sin el propio residente y con el nombre normalizado', async () => {
    const { service, repository } = setup();
    await service.search(me, query({ name: 'José  PEÑA' }));
    expect(repository.search).toHaveBeenCalledWith({
      requesterId: 'user-5',
      searchName: 'jose pena',
      unit: undefined,
      skip: 0,
      take: 20,
    });
  });

  it.each([
    ['sin criterio', {}],
    [
      'con nombre y unidad',
      { name: 'gomez', towerId: TOWER_ID, unitNumber: '101' },
    ],
    ['con la torre sin número', { towerId: TOWER_ID }],
    ['con el número sin torre', { unitNumber: '101' }],
  ])('AC6: responde 400 %s', async (_caso, criteria) => {
    const { service, repository } = setup();
    const error = await rejection(service.search(me, query(criteria)));
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error?.getResponse()).toMatchObject({
      message: ['Busca por nombre o por torre y número de unidad.'],
    });
    expect(repository.search).not.toHaveBeenCalled();
  });
});

describe('búsqueda del directorio', () => {
  it('por unidad pide la torre y el número, y la página 3 de 20 pide skip 40', async () => {
    const { service, repository } = setup();
    await service.search(
      me,
      query({ towerId: TOWER_ID, unitNumber: '101', page: 3 }),
    );
    expect(repository.search).toHaveBeenCalledWith({
      requesterId: 'user-5',
      searchName: undefined,
      unit: { towerId: TOWER_ID, number: '101' },
      skip: 40,
      take: 20,
    });
  });

  it('responde el total y la paginación pedida', async () => {
    const { service } = setup();
    const page = await service.search(
      me,
      query({ name: 'gomez', page: 2, pageSize: 5 }),
    );
    expect(page).toMatchObject({ total: 2, page: 2, pageSize: 5 });
  });
});
