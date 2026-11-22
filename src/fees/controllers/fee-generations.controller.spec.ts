import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@Auth/decorators';
import { RolesGuard } from '@Auth/guards';
import type { Role, User } from '@PrismaClient';
import { FeeGenerationsController } from './fee-generations.controller.js';
import type { FeeGenerationsService } from '../services/index.js';

const HANDLER = 'generate';

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => FeeGenerationsController.prototype[HANDLER],
    getClass: () => FeeGenerationsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H3. Generación mensual de cuotas', () => {
  const guard = new RolesGuard(new Reflector());

  it('AC4: POST /cuotas/generaciones genera a nombre del administrador de la sesión', async () => {
    const admin = { id: 'admin-1', role: 'ADMINISTRADOR' } as User;
    const body = { period: '2026-12', amount: 35.5, dueDate: '2026-12-10' };
    const feeGenerations = {
      generate: vi.fn().mockResolvedValue({ id: 'gen-1', createdCount: 5 }),
    };
    const controller = new FeeGenerationsController(
      feeGenerations as unknown as FeeGenerationsService,
    );

    await expect(controller.generate(admin, body)).resolves.toMatchObject({
      id: 'gen-1',
      createdCount: 5,
    });
    expect(feeGenerations.generate).toHaveBeenCalledWith(admin, body);
  });

  it('AC7: las generaciones de cuotas son solo del Administrador', () => {
    expect(Reflect.getMetadata(ROLES_KEY, FeeGenerationsController)).toEqual([
      'ADMINISTRADOR',
    ]);
  });

  it.each<Role>(['RESIDENTE', 'SEGURIDAD'])(
    'AC7: %s recibe 403 al generar cuotas',
    (role) => {
      expect(() => guard.canActivate(requestAs(role))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('AC7: el Administrador sí puede generar cuotas', () => {
    expect(guard.canActivate(requestAs('ADMINISTRADOR'))).toBe(true);
  });
});
