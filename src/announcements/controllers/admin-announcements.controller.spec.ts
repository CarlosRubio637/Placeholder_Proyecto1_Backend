import {
  ForbiddenException,
  RequestMethod,
  type ExecutionContext,
} from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import { RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { AdminAnnouncementsController } from './admin-announcements.controller.js';

const HANDLERS = ['list', 'readers'] as const;

function requestTo(
  handler: (typeof HANDLERS)[number],
  role: Role,
): ExecutionContext {
  return {
    getHandler: () => AdminAnnouncementsController.prototype[handler],
    getClass: () => AdminAnnouncementsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H26. Comunicados publicados y control de lecturas', () => {
  const guard = new RolesGuard(new Reflector());

  it.each(
    HANDLERS.flatMap((handler) =>
      (['RESIDENTE', 'SEGURIDAD'] as const).map(
        (role): [Role, (typeof HANDLERS)[number]] => [role, handler],
      ),
    ),
  )('AC6: %s recibe 403 en %s', (role, handler) => {
    expect(() => guard.canActivate(requestTo(handler, role))).toThrow(
      ForbiddenException,
    );
  });

  it.each(HANDLERS)('AC6: el Administrador sí entra a %s', (handler) => {
    expect(guard.canActivate(requestTo(handler, 'ADMINISTRADOR'))).toBe(true);
  });
});

const H25_HANDLERS = ['publish', 'countAudience'] as const;
type H25Handler = (typeof H25_HANDLERS)[number];
const EDIT_VERBS = ['PUT', 'PATCH', 'DELETE'];

function requestAs(handler: H25Handler, role: Role): ExecutionContext {
  return {
    getHandler: () => AdminAnnouncementsController.prototype[handler],
    getClass: () => AdminAnnouncementsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

function routeVerbs(): string[] {
  const { prototype } = AdminAnnouncementsController;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map(
      (name) =>
        Reflect.getMetadata(
          METHOD_METADATA,
          prototype[name as keyof AdminAnnouncementsController],
        ) as RequestMethod | undefined,
    )
    .filter((method): method is RequestMethod => method !== undefined)
    .map((method) => RequestMethod[method]);
}

describe('H25. Publicación de comunicados segmentados', () => {
  const guard = new RolesGuard(new Reflector());

  it('AC9: el controlador solo admite al Administrador', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminAnnouncementsController),
    ).toEqual(['ADMINISTRADOR']);
  });

  it.each(
    H25_HANDLERS.flatMap((handler) =>
      (['RESIDENTE', 'SEGURIDAD'] as const).map((role): [Role, H25Handler] => [
        role,
        handler,
      ]),
    ),
  )('AC9: %s recibe 403 en %s', (role, handler) => {
    expect(() => guard.canActivate(requestAs(handler, role))).toThrow(
      ForbiddenException,
    );
  });

  it.each(H25_HANDLERS)('AC9: el Administrador sí entra a %s', (handler) => {
    expect(guard.canActivate(requestAs(handler, 'ADMINISTRADOR'))).toBe(true);
  });

  it('AC7: el controlador no expone rutas PUT, PATCH ni DELETE', () => {
    const verbs = routeVerbs();
    expect(verbs).toContain('POST');
    expect(verbs.filter((verb) => EDIT_VERBS.includes(verb))).toEqual([]);
  });
});
