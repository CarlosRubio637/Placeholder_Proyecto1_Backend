import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import { RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { ProfileController } from './profile.controller.js';

const HANDLER_BY_ROUTE = {
  'GET /perfil': 'get',
  'PUT /perfil': 'update',
} as const;

type Route = keyof typeof HANDLER_BY_ROUTE;

function requestAs(role: Role, route: Route): ExecutionContext {
  return {
    getHandler: () => ProfileController.prototype[HANDLER_BY_ROUTE[route]],
    getClass: () => ProfileController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H28. Perfil y privacidad en el directorio', () => {
  const guard = new RolesGuard(new Reflector());

  it('AC7: las rutas del perfil no reciben un id de usuario', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ProfileController)).toBe(
      'perfil',
    );
    for (const handler of Object.values(HANDLER_BY_ROUTE)) {
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          ProfileController.prototype[handler],
        ),
      ).toBe('/');
    }
  });

  it('AC8: solo el Residente tiene permiso en /perfil', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProfileController)).toEqual([
      'RESIDENTE',
    ]);
  });

  it.each<[Role, Route]>([
    ['ADMINISTRADOR', 'GET /perfil'],
    ['ADMINISTRADOR', 'PUT /perfil'],
    ['SEGURIDAD', 'GET /perfil'],
    ['SEGURIDAD', 'PUT /perfil'],
  ])('AC8: %s recibe 403 en %s', (role, route) => {
    expect(() => guard.canActivate(requestAs(role, route))).toThrow(
      ForbiddenException,
    );
  });

  it.each<Route>(['GET /perfil', 'PUT /perfil'])(
    'AC8: el Residente sí entra a %s',
    (route) => {
      expect(guard.canActivate(requestAs('RESIDENTE', route))).toBe(true);
    },
  );
});
