import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FORBIDDEN_BODY, RolesGuard } from './roles.guard.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { Role, User } from '@PrismaClient';

function contextFor(
  metadata: { roles?: Role[]; isPublic?: boolean },
  user?: Partial<User>,
): ExecutionContext {
  const handler = () => undefined;
  if (metadata.roles) Reflect.defineMetadata(ROLES_KEY, metadata.roles, handler);
  if (metadata.isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);

  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('deja pasar una ruta sin @Roles', () => {
    expect(guard.canActivate(contextFor({}, { role: 'RESIDENTE' }))).toBe(true);
  });

  it('deja pasar una ruta pública aunque tenga @Roles', () => {
    expect(
      guard.canActivate(contextFor({ roles: ['ADMINISTRADOR'], isPublic: true })),
    ).toBe(true);
  });

  it('deja pasar cuando el rol del usuario está permitido', () => {
    const ctx = contextFor({ roles: ['ADMINISTRADOR', 'SEGURIDAD'] }, { role: 'SEGURIDAD' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('responde 403 con el cuerpo de H38 cuando el rol no está permitido', () => {
    const ctx = contextFor({ roles: ['ADMINISTRADOR'] }, { role: 'RESIDENTE' });
    try {
      guard.canActivate(ctx);
      expect.unreachable('debía lanzar ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual(FORBIDDEN_BODY);
    }
  });

  it('responde 403 si no hay usuario en el request', () => {
    expect(() => guard.canActivate(contextFor({ roles: ['RESIDENTE'] }))).toThrow(
      ForbiddenException,
    );
  });
});
