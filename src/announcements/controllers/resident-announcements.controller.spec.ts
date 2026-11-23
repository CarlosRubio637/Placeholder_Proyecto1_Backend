import {
  ForbiddenException,
  RequestMethod,
  type ExecutionContext,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import { RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { ResidentAnnouncementsController } from './resident-announcements.controller.js';

const HANDLERS = ['list', 'read'] as const;

type Handler = (typeof HANDLERS)[number];

function requestTo(handler: Handler, role: Role): ExecutionContext {
  return {
    getHandler: () => ResidentAnnouncementsController.prototype[handler],
    getClass: () => ResidentAnnouncementsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

function routes(): string[] {
  const prototype = ResidentAnnouncementsController.prototype;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => {
      const handler = prototype[name as Handler];
      const method =
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)];
      return `${method} ${Reflect.getMetadata(PATH_METADATA, handler)}`;
    });
}

describe('H27. Consulta de comunicados relevantes', () => {
  const guard = new RolesGuard(new Reflector());

  it('AC7: /comunicados solo expone la lista y abrir, sin ruta para borrar o deshacer la lectura', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, ResidentAnnouncementsController),
    ).toBe('comunicados');
    expect(routes()).toEqual(['GET /', 'POST :id/lectura']);
  });

  it('AC8: el controlador solo admite el rol RESIDENTE', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ResidentAnnouncementsController),
    ).toEqual(['RESIDENTE']);
  });

  it.each(HANDLERS)(
    'AC8: el Personal de seguridad recibe 403 en %s',
    (handler) => {
      expect(() => guard.canActivate(requestTo(handler, 'SEGURIDAD'))).toThrow(
        ForbiddenException,
      );
    },
  );

  it.each(HANDLERS)('AC8: el Residente sí entra a %s', (handler) => {
    expect(guard.canActivate(requestTo(handler, 'RESIDENTE'))).toBe(true);
  });
});

describe('roles de /comunicados', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(HANDLERS)('el Administrador también recibe 403 en %s', (handler) => {
    expect(() =>
      guard.canActivate(requestTo(handler, 'ADMINISTRADOR')),
    ).toThrow(ForbiddenException);
  });
});
