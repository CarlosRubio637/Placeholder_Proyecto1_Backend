import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { AdminIncidentsController } from './admin-incidents.controller.js';

const changeStatusHandler: unknown = Reflect.get(
  AdminIncidentsController.prototype,
  'changeStatus',
);

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => changeStatusHandler,
    getClass: () => AdminIncidentsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H13. Cambio de estado y seguimiento de incidencias', () => {
  const guard = new RolesGuard(new Reflector());

  it.each<Role>(['RESIDENTE', 'SEGURIDAD'])(
    'AC9: POST /admin/incidencias/:id/estado responde 403 a %s',
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

  it('AC4: solo el Administrador ejecuta las transiciones', () => {
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
