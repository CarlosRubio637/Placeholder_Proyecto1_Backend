import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@Auth/guards';
import type { Role } from '@PrismaClient';
import { AdminAnnouncementsController } from './admin-announcements.controller.js';
import type {
  AnnouncementReadsService,
  AnnouncementsService,
} from '../services/index.js';

const ANNOUNCEMENT_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';
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

describe('comunicados del administrador', () => {
  it('la lista y las lecturas delegan en el servicio', async () => {
    const reads = {
      list: vi
        .fn()
        .mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }),
      readers: vi.fn().mockResolvedValue({ total: 0 }),
    };
    const controller = new AdminAnnouncementsController(
      {} as AnnouncementsService,
      reads as unknown as AnnouncementReadsService,
    );
    await controller.list({ status: 'VIGENTE', page: 1, pageSize: 20 });
    await controller.readers(ANNOUNCEMENT_ID, {
      read: false,
      page: 2,
      pageSize: 50,
    });
    expect(reads.list).toHaveBeenCalledWith({
      status: 'VIGENTE',
      page: 1,
      pageSize: 20,
    });
    expect(reads.readers).toHaveBeenCalledWith(ANNOUNCEMENT_ID, {
      read: false,
      page: 2,
      pageSize: 50,
    });
  });
});
