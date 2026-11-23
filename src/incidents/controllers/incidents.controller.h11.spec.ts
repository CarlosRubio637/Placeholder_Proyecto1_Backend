import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { IncidentsController } from './incidents.controller.js';

type Route = 'listMine' | 'detail' | 'photo';

const ROUTES: [Route, string][] = [
  ['listMine', 'GET /incidencias/mias'],
  ['detail', 'GET /incidencias/:id'],
  ['photo', 'GET /incidencias/fotos/:fotoId'],
];

function requestAs(role: Role, route: Route): ExecutionContext {
  const handler: unknown = Reflect.get(IncidentsController.prototype, route);
  return {
    getHandler: () => handler,
    getClass: () => IncidentsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H11. Mis incidencias y detalle con historial', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(ROUTES)('AC8: %s (%s) responde 403 a SEGURIDAD', (route) => {
    let rejection: unknown;
    try {
      guard.canActivate(requestAs('SEGURIDAD', route));
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(ForbiddenException);
    expect((rejection as ForbiddenException).getResponse()).toEqual(
      FORBIDDEN_BODY,
    );
  });

  it.each(ROUTES)('AC8: %s (%s) deja pasar al Residente', (route) => {
    expect(guard.canActivate(requestAs('RESIDENTE', route))).toBe(true);
  });
});
