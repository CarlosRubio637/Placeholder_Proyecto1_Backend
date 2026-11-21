import { ConflictException, NotFoundException } from '@nestjs/common';
import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { VisitStatus, type User } from '@PrismaClient';
import { EXIT_MESSAGES } from './visits.constants.js';
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

describe('SecurityVisitsService.registerExit (H17)', () => {
  it('pasa la visita de Dentro a Finalizada con la hora del servidor y el agente', async () => {
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

  it('409 si la visita no está Dentro (o otro agente ya registró la salida)', async () => {
    const { service, prisma } = setup();
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });

    const error = await service
      .registerExit(GUARD, 'visit-1', NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as Error).message).toBe(EXIT_MESSAGES.notInside);
    expect(prisma.visit.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('404 si la visita no existe', async () => {
    const { service, prisma } = setup();
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });
    prisma.visit.findUnique.mockResolvedValue(null);

    const error = await service
      .registerExit(GUARD, 'x', NOW)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as Error).message).toBe(EXIT_MESSAGES.visitNotFound);
  });

  it('no envía avisos', async () => {
    const { service, notifications } = setup();
    await service.registerExit(GUARD, 'visit-1', NOW);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});
