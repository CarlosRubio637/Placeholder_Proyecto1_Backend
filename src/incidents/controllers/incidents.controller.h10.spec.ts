import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { IncidentsController } from './incidents.controller.js';

const createHandler: unknown = Reflect.get(
  IncidentsController.prototype,
  'create',
);

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => createHandler,
    getClass: () => IncidentsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H10. Registro de incidencia con evidencia', () => {
  const guard = new RolesGuard(new Reflector());

  it.each<Role>(['ADMINISTRADOR', 'SEGURIDAD'])(
    'AC8: POST /incidencias responde 403 a %s',
    (role) => {
      let rejection: unknown;
      try {
        guard.canActivate(requestAs(role));
      } catch (error) {
        rejection = error;
      }

      expect(rejection).toBeInstanceOf(ForbiddenException);
      expect((rejection as ForbiddenException).getResponse()).toEqual(
        FORBIDDEN_BODY,
      );
    },
  );

  it('AC8: POST /incidencias deja pasar al Residente', () => {
    expect(guard.canActivate(requestAs('RESIDENTE'))).toBe(true);
  });
});
