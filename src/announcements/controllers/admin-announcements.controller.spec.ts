import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
