import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import { ProfileService } from './profile.service.js';
import {
  ProfileRepository,
  type DirectoryPrefs,
  type ResidentProfile,
} from '../repositories/index.js';
import { ProfileNotFoundError } from '../errors/index.js';
import { DIRECTORY_MESSAGES } from '../directory.constants.js';
import type { UpdateProfileDto } from '../dto/index.js';

const resident = { id: 'user-1', role: 'RESIDENTE' } as User;

const stored: ResidentProfile = {
  fullName: 'Ana María López',
  email: 'ana.lopez@correo.com',
  unitCode: 'A-101',
  phone: '7845-1290',
  directory: {
    visible: true,
    showName: true,
    showUnit: false,
    showPhone: false,
    showEmail: false,
  },
};

const dto = {
  phone: '7000-1111',
  directory: {
    visible: true,
    showName: true,
    showUnit: true,
    showPhone: false,
    showEmail: false,
  },
} satisfies UpdateProfileDto;

function setup() {
  const repository = {
    findByUser: vi.fn().mockResolvedValue(stored),
    save: vi.fn().mockResolvedValue(stored),
  };
  const service = new ProfileService(
    repository as unknown as ProfileRepository,
  );
  return { repository, service };
}

function setupWithPrisma(directoryPreference: DirectoryPrefs | null) {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        email: stored.email,
        unit: { code: stored.unitCode },
        profile: { fullName: stored.fullName, phone: stored.phone },
        directoryPreference,
      }),
    },
    profile: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    directoryPreference: { upsert: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn((work: (tx: typeof db) => Promise<unknown>) =>
      work(db),
    ),
  };
  const service = new ProfileService(
    new ProfileRepository(prisma as unknown as PrismaService),
  );
  return { db, service };
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('se esperaba un error');
    },
    (error: unknown) => error,
  );
}

describe('H28. Perfil y privacidad en el directorio', () => {
  it('AC5: guarda el teléfono en Profile y las preferencias en DirectoryPreference', async () => {
    const { db, service } = setupWithPrisma(null);
    await service.update(resident, dto);
    expect(db.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { phone: '7000-1111' },
    });
    expect(db.directoryPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1', ...dto.directory },
      update: dto.directory,
    });
  });

  it('AC5: el residente recién registrado, sin preferencias guardadas, tiene todo desactivado', async () => {
    const { service } = setupWithPrisma(null);
    const profile = await service.get(resident);
    expect(profile.directory).toEqual({
      visible: false,
      showName: false,
      showUnit: false,
      showPhone: false,
      showEmail: false,
    });
  });

  it('AC6: rechaza aparecer en el directorio sin mostrar el nombre', async () => {
    const { repository, service } = setup();
    const error = await rejection(
      service.update(resident, {
        ...dto,
        directory: { ...dto.directory, showName: false },
      }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: 'directory.showName',
      message: ['Para aparecer en el directorio debes mostrar tu nombre.'],
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('AC7: devuelve el perfil del usuario del token con sus preferencias', async () => {
    const { repository, service } = setup();
    await expect(service.get(resident)).resolves.toEqual(stored);
    expect(repository.findByUser).toHaveBeenCalledWith('user-1');
  });

  it('AC7: guarda el teléfono y las preferencias del usuario del token', async () => {
    const { repository, service } = setup();
    await expect(service.update(resident, dto)).resolves.toEqual(stored);
    expect(repository.save).toHaveBeenCalledWith(
      'user-1',
      '7000-1111',
      dto.directory,
    );
  });
});

describe('ProfileService', () => {
  it('guarda las casillas aunque el interruptor esté apagado', async () => {
    const { repository, service } = setup();
    const hidden = {
      visible: false,
      showName: false,
      showUnit: true,
      showPhone: false,
      showEmail: true,
    };
    await service.update(resident, { ...dto, directory: hidden });
    expect(repository.save).toHaveBeenCalledWith('user-1', '7000-1111', hidden);
  });

  it('responde 404 si el usuario no tiene perfil al consultar', async () => {
    const { repository, service } = setup();
    repository.findByUser.mockRejectedValue(new ProfileNotFoundError('user-1'));
    const error = await rejection(service.get(resident));
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(
      DIRECTORY_MESSAGES.profileNotFound,
    );
  });

  it('responde 404 si el usuario no tiene perfil al guardar', async () => {
    const { repository, service } = setup();
    repository.save.mockRejectedValue(new ProfileNotFoundError('user-1'));
    const error = await rejection(service.update(resident, dto));
    expect(error).toBeInstanceOf(NotFoundException);
  });
});
