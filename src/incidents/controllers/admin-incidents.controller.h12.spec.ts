import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { AdminIncidentsController } from './admin-incidents.controller.js';

type Route = 'list' | 'staff' | 'update';

const ROUTES: [Route, string][] = [
  ['list', 'GET /admin/incidencias'],
  ['staff', 'GET /admin/responsables'],
  ['update', 'PATCH /admin/incidencias/:id'],
];

function requestAs(role: Role, route: Route): ExecutionContext {
  const handler: unknown = Reflect.get(
    AdminIncidentsController.prototype,
    route,
  );
  return {
    getHandler: () => handler,
    getClass: () => AdminIncidentsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

const CASES = ROUTES.flatMap(([route, label]) =>
  (['RESIDENTE', 'SEGURIDAD'] as Role[]).map(
    (role) => [label, role, route] as const,
  ),
);

describe('H12. Bandeja de incidencias del administrador: priorizar y asignar', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(CASES)('AC8: %s responde 403 a %s', (_label, role, route) => {
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

  it.each(ROUTES)('AC8: %s (%s) deja pasar al Administrador', (route) => {
    expect(guard.canActivate(requestAs('ADMINISTRADOR', route))).toBe(true);
  });
});
