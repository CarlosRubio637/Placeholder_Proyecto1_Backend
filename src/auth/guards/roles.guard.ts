import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import type { Role } from '@PrismaClient';

/** Cuerpo del 403 que define H38. */
export const FORBIDDEN_BODY = {
  code: 'FORBIDDEN',
  message: 'No tienes permiso para esta acción.',
} as const;

/**
 * Guard global de roles (H38).
 *
 * Corre después de JwtAuthGuard, que ya cargó el usuario en el request
 * (sin sesión, JwtAuthGuard responde 401 antes de llegar acá). Toma el rol de
 * la base y no del token, así un cambio de rol aplica sin esperar a que el
 * token expire.
 *
 * Importa los decoradores por ruta relativa por la misma razón que
 * JwtAuthGuard: evitar un ciclo entre los barrels de guards/ y decorators/.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      targets,
    );
    if (!allowed || allowed.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !allowed.includes(user.role)) {
      throw new ForbiddenException(FORBIDDEN_BODY);
    }
    return true;
  }
}
