import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { VisitStatus, type Role, type User } from '@PrismaClient';
import { EXIT_MESSAGES } from './visits.constants.js';
import { SecurityVisitsController } from './security-visits.controller.js';
import { SecurityVisitsService } from './security-visits.service.js';

const NOW = new Date('2026-11-19T20:30:00Z'); // 14:30 en El Salvador
const ENTRY_AT = new Date('2026-11-19T16:05:00Z');
const GUARD = { id: 'guard-1' } as User;

function setup() {
  const prisma = {
    visit: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ id: 'visit-1' }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 'visit-1',
        entryAt: ENTRY_AT,
        exitAt: NOW,
      }),
    },
  };
  const notifications = { send: vi.fn() };
  const service = new SecurityVisitsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, notifications };
}

function requestAs(role: Role): ExecutionContext {
  return {
    getHandler: () => SecurityVisitsController.prototype.registerExit,
    getClass: () => SecurityVisitsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
}

describe('H17. Registro de salida de visitantes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC4: pasa la visita de Dentro a Finalizada con la hora y el agente de seguridad', async () => {
    const { service, prisma } = setup();

    const result = await service.registerExit(GUARD, 'visit-1', NOW);

    expect(prisma.visit.updateMany).toHaveBeenCalledWith({
      where: { id: 'visit-1', status: VisitStatus.DENTRO },
      data: {
        status: VisitStatus.FINALIZADA,
        exitAt: NOW,
        exitById: 'guard-1',
      },
    });
    expect(result).toEqual({
      id: 'visit-1',
      status: VisitStatus.FINALIZADA,
      entryAt: ENTRY_AT,
      exitAt: NOW,
    });
  });

  it('AC4: sin hora explícita guarda la hora del servidor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { service, prisma } = setup();

    await service.registerExit(GUARD, 'visit-1');

    const [args] = prisma.visit.updateMany.mock.calls[0] as [
      { data: { exitAt: Date } },
    ];
    expect(args.data.exitAt).toEqual(NOW);
  });

  it('AC4: registrar la salida no envía avisos', async () => {
    const { service, notifications } = setup();

    await service.registerExit(GUARD, 'visit-1', NOW);

    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('AC5: 409 "Este visitante no tiene una entrada activa." si la visita no está Dentro', async () => {
    const { service, prisma } = setup();
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });

    const error = await service
      .registerExit(GUARD, 'visit-1', NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(EXIT_MESSAGES.notInside);
    expect(prisma.visit.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('AC5: si dos agentes registran la misma salida a la vez, solo se aplica la primera', async () => {
    const { service, prisma } = setup();
    // La condición status = DENTRO hace que solo una actualización afecte la fila.
    prisma.visit.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const otherGuard = { id: 'guard-2' } as User;

    const [first, second] = await Promise.allSettled([
      service.registerExit(GUARD, 'visit-1', NOW),
      service.registerExit(otherGuard, 'visit-1', NOW),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    for (const [args] of prisma.visit.updateMany.mock.calls as [
      { where: unknown },
    ][]) {
      expect(args.where).toEqual({ id: 'visit-1', status: VisitStatus.DENTRO });
    }
  });

  it('AC5: 404 si la visita no existe', async () => {
    const { service, prisma } = setup();
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });
    prisma.visit.findUnique.mockResolvedValue(null);

    const error = await service
      .registerExit(GUARD, 'x', NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(EXIT_MESSAGES.visitNotFound);
  });

  describe('AC6: permisos', () => {
    const guard = new RolesGuard(new Reflector());

    it.each<Role>(['RESIDENTE', 'ADMINISTRADOR'])(
      'AC6: %s recibe 403 al registrar una salida',
      (role) => {
        expect(() => guard.canActivate(requestAs(role))).toThrow(
          ForbiddenException,
        );
      },
    );

    it('AC6: el Personal de seguridad sí registra salidas', () => {
      expect(guard.canActivate(requestAs('SEGURIDAD'))).toBe(true);
    });
  });
});
