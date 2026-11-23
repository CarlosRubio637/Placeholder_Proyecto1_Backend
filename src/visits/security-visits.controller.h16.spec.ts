import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { SecurityVisitsController } from './security-visits.controller.js';

type Route = 'search' | 'createRequest' | 'listRequests' | 'registerEntry';

const ROUTES: [Route, string][] = [
  ['search', 'GET /seguridad/visitas/buscar'],
  ['createRequest', 'POST /seguridad/visitas/solicitudes'],
  ['listRequests', 'GET /seguridad/visitas/solicitudes'],
  ['registerEntry', 'POST /seguridad/visitas/:id/entrada'],
];

function requestAs(role: Role, route: Route): ExecutionContext {
  const handler: unknown = Reflect.get(
    SecurityVisitsController.prototype,
    route,
  );
  return {
    getHandler: () => handler,
    getClass: () => SecurityVisitsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

const CASES = ROUTES.flatMap(([route, label]) =>
  (['RESIDENTE', 'ADMINISTRADOR'] as Role[]).map(
    (role) => [label, role, route] as const,
  ),
);

describe('H16. Registro de entrada de visitantes', () => {
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

  it.each(ROUTES)(
    'AC10: %s (%s) deja pasar al Personal de seguridad',
    (route) => {
      expect(guard.canActivate(requestAs('SEGURIDAD', route))).toBe(true);
    },
  );
});
