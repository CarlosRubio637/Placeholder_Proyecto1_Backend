import type { PrismaService } from '@Prisma/services';
import { UserRepository } from './user.repository.js';

const RESIDENT = {
  email: 'Nueva.Residente@Condominio.test',
  passwordHash: 'hash',
  registrationCode: 'ABCD1234',
  fullName: 'Nueva Residente',
  searchName: 'nueva residente',
  phone: '7000-1234',
};

function setup() {
  const tx = {
    unit: { findUnique: vi.fn().mockResolvedValue({ id: 'unit-1' }) },
    user: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'user-1' }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const repository = new UserRepository(prisma as unknown as PrismaService);
  return { repository, tx };
}

describe('H28. Perfil y privacidad en el directorio', () => {
  it('AC5: al registrarse crea las preferencias del directorio con todo desactivado', async () => {
    const { repository, tx } = setup();

    await repository.createResident(RESIDENT);

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          directoryPreference: {
            create: {
              visible: false,
              showName: false,
              showUnit: false,
              showPhone: false,
              showEmail: false,
            },
          },
        }),
      }),
    );
  });

  it('AC5: el teléfono del registro queda en el perfil', async () => {
    const { repository, tx } = setup();

    await repository.createResident(RESIDENT);

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profile: {
            create: {
              fullName: 'Nueva Residente',
              searchName: 'nueva residente',
              phone: '7000-1234',
            },
          },
        }),
      }),
    );
  });
});
