import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { OverdueUnitsController } from './overdue-units.controller.js';

const getReportHandler: unknown = Reflect.get(
  OverdueUnitsController.prototype,
  'getReport',
);

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => getReportHandler,
    getClass: () => OverdueUnitsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H4. Reporte de unidades morosas', () => {
  const guard = new RolesGuard(new Reflector());

  it.each<Role>(['RESIDENTE', 'SEGURIDAD'])(
    'AC8: GET /morosidad responde 403 a %s',
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

  it('AC8: GET /morosidad deja pasar al Administrador', () => {
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
