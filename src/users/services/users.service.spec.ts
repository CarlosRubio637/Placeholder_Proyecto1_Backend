import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { toSearchName, UsersService } from './users.service.js';
import {
  EmailAlreadyTakenError,
  UnitFullError,
  UnitNotFoundError,
} from '../errors/index.js';
import type { UserRepository } from '../repositories/index.js';

const input = {
  fullName: 'Ana María López',
  email: 'ana.lopez@correo.com',
  phone: '7845-1290',
  unitCode: 'K7H2M9QX',
  password: 'Prueba2026',
};

function serviceWith(createResident: UserRepository['createResident']) {
  const repository = { createResident } as unknown as UserRepository;
  // 4 rondas: el costo de bcrypt no importa en las pruebas.
  const config = { get: () => 4 } as unknown as ConfigService<never, true>;
  return new UsersService(repository, config as never);
}

describe('toSearchName', () => {
  it('quita tildes, diéresis y ñ, pasa a minúsculas y une espacios', () => {
    expect(toSearchName('  José   Peña Güell ')).toBe('jose pena guell');
    expect(toSearchName("María O'Neil-Ávila")).toBe("maria o'neil-avila");
  });
});

describe('UsersService.registerResident', () => {
  it('manda al repositorio el hash, el código de unidad y el searchName', async () => {
    const createResident = vi.fn().mockResolvedValue({ id: 'u1' });
    await serviceWith(createResident).registerResident(input);

    const data = createResident.mock.calls[0][0];
    expect(data).toMatchObject({
      email: input.email,
      registrationCode: 'K7H2M9QX',
      fullName: 'Ana María López',
      searchName: 'ana maria lopez',
      phone: '7845-1290',
    });
    expect(data.passwordHash).not.toBe(input.password);
  });

  it.each([
    [new UnitNotFoundError('K7H2M9QX'), NotFoundException, 'El código de unidad no existe.'],
    [new UnitFullError('unit-1', 4), ConflictException, 'La unidad ya tiene 4 residentes registrados.'],
    [new EmailAlreadyTakenError(input.email), ConflictException, 'Ya existe una cuenta con ese correo.'],
  ])('traduce %s al error HTTP de H38', async (domainError, HttpError, message) => {
    const service = serviceWith(vi.fn().mockRejectedValue(domainError));
    const promise = service.registerResident(input);
    await expect(promise).rejects.toBeInstanceOf(HttpError);
    await expect(promise).rejects.toThrow(message);
  });
});
