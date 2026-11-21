import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { User } from '@PrismaClient';
import { ProfileService } from './profile.service.js';
import type {
  ProfileRepository,
  ResidentProfile,
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

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error('se esperaba un error');
    },
    (error: unknown) => error,
  );
}

describe('ProfileService', () => {
  it('devuelve el perfil con las preferencias del repositorio', async () => {
    const { repository, service } = setup();
    await expect(service.get(resident)).resolves.toEqual(stored);
    expect(repository.findByUser).toHaveBeenCalledWith('user-1');
  });

  it('rechaza aparecer en el directorio sin mostrar el nombre', async () => {
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
      message: [DIRECTORY_MESSAGES.nameRequired],
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('guarda el teléfono y las preferencias del usuario del token', async () => {
    const { repository, service } = setup();
    await expect(service.update(resident, dto)).resolves.toEqual(stored);
    expect(repository.save).toHaveBeenCalledWith(
      'user-1',
      '7000-1111',
      dto.directory,
    );
  });

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
