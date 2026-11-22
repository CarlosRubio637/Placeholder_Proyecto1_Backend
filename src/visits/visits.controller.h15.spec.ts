import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { VisitsController } from './visits.controller.js';

type Route = 'listMine' | 'cancel' | 'respond';

const ROUTES: [Route, string][] = [
  ['listMine', 'GET /visitas/mias'],
  ['cancel', 'PATCH /visitas/:id/cancelar'],
  ['respond', 'POST /visitas/:id/respuesta'],
];

function requestAs(role: Role, route: Route): ExecutionContext {
  const handler: unknown = Reflect.get(VisitsController.prototype, route);
  return {
    getHandler: () => handler,
    getClass: () => VisitsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

const CASES = ROUTES.flatMap(([route, label]) =>
  (['ADMINISTRADOR', 'SEGURIDAD'] as Role[]).map(
    (role) => [label, role, route] as const,
  ),
);

describe('H15. Mis visitas: cancelar autorizaciones y responder solicitudes', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(CASES)('AC10: %s responde 403 a %s', (_label, role, route) => {
    let rejection: unknown;
    try {
      guard.canActivate(requestAs(role, route));
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(ForbiddenException);
    expect((rejection as ForbiddenException).getResponse()).toEqual(
      FORBIDDEN_BODY,
    );
  });

  it.each(ROUTES)('AC10: %s (%s) deja pasar al Residente', (route) => {
    expect(guard.canActivate(requestAs('RESIDENTE', route))).toBe(true);
  });
});
