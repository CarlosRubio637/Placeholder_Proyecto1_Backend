import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { UsersService } from '@Users/services';

const SECRET = 'secreto-de-prueba';
const jwt = new JwtService({ secret: SECRET });
const PAYLOAD = { sub: 'u1', email: 'a@condominio.test', role: 'RESIDENTE' };
const activeUser = { id: 'u1', isActive: true };

function setup(authorization?: string, isPublic = false) {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: { authorization },
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(isPublic) };
  const usersService = { findById: vi.fn().mockResolvedValue(activeUser) };
  const guard = new JwtAuthGuard(
    reflector as unknown as Reflector,
    jwt,
    usersService as unknown as UsersService,
  );
  return { guard, context, request, usersService };
}

async function messageOf(promise: Promise<unknown>) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(UnauthorizedException);
  return (error as UnauthorizedException).message;
}

describe('JwtAuthGuard', () => {
  it('deja pasar las rutas públicas sin mirar el token', async () => {
    const { guard, context, usersService } = setup(undefined, true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it('con un token válido carga en el request el usuario leído de la base', async () => {
    const token = await jwt.signAsync(PAYLOAD);
    const { guard, context, request, usersService } = setup(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(usersService.findById).toHaveBeenCalledWith('u1');
    expect(request.user).toBe(activeUser);
  });

  it('acepta el esquema sin importar mayúsculas', async () => {
    const token = await jwt.signAsync(PAYLOAD);
    const { guard, context } = setup(`bearer ${token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each([
    ['sin encabezado', undefined],
    ['otro esquema', 'Basic abc123'],
    ['Bearer sin token', 'Bearer'],
  ])('401 "falta el token": %s', async (_caso, header) => {
    const { guard, context } = setup(header);
    await expect(messageOf(guard.canActivate(context))).resolves.toBe(
      'Falta el token de acceso.',
    );
  });

  it('mismo 401 para token malformado, firma ajena y token vencido', async () => {
    const otherKey = new JwtService({ secret: 'otro-secreto' });
    const tokens = [
      'no-es-un-jwt',
      await otherKey.signAsync(PAYLOAD),
      await jwt.signAsync(PAYLOAD, { expiresIn: -10 }),
    ];
    for (const token of tokens) {
      const { guard, context, usersService } = setup(`Bearer ${token}`);
      await expect(messageOf(guard.canActivate(context))).resolves.toBe(
        'Token de acceso inválido o expirado.',
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['ya no existe', null],
    ['fue desactivada', { id: 'u1', isActive: false }],
  ])(
    '401 aunque el token siga vigente si la cuenta %s',
    async (_caso, found) => {
      const token = await jwt.signAsync(PAYLOAD);
      const { guard, context, request, usersService } = setup(
        `Bearer ${token}`,
      );
      usersService.findById.mockResolvedValue(found);

      await expect(messageOf(guard.canActivate(context))).resolves.toBe(
        'La cuenta no existe o está inactiva.',
      );
      expect(request.user).toBeUndefined();
    },
  );
});
