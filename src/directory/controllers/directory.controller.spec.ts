import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { DirectoryController } from './directory.controller.js';

const HANDLER = 'search';

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => DirectoryController.prototype[HANDLER],
    getClass: () => DirectoryController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H29. Búsqueda de contacto de vecinos', () => {
  const guard = new RolesGuard(new Reflector());

  it.each<Role>(['ADMINISTRADOR', 'SEGURIDAD'])(
    'AC7: %s recibe 403 en el directorio',
    (role) => {
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('AC7: el Residente sí entra al directorio', () => {
    expect(guard.canActivate(requestAs('RESIDENTE'))).toBe(true);
  });
});
