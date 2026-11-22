import type { NotificationsService } from '@Notifications';
import type { PrismaService } from '@Prisma/services';
import { Role, type User } from '@PrismaClient';
import { ResidentVisitsService } from './resident-visits.service.js';

const NOW = new Date('2026-11-19T16:00:00Z');

/** Segundo residente de A-101: las visitas de las pruebas las creó res-1. */
const LUIS = { id: 'res-2', role: Role.RESIDENTE, unitId: 'unit-1' } as User;

function setup() {
  const prisma = {
    visit: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        visitorName: 'Pedro Gómez',
        unit: { code: 'A-101' },
      }),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ fullName: 'Luis Gómez' }),
    },
    user: { findMany: vi.fn().mockResolvedValue([{ id: 'guard-1' }]) },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
  const service = new ResidentVisitsService(
    prisma as unknown as PrismaService,
    {
      send: vi.fn().mockResolvedValue({ created: 1 }),
    } as unknown as NotificationsService,
  );
  return { service, prisma };
}

describe('H15. Mis visitas: cancelar autorizaciones y responder solicitudes', () => {
  it('AC5: cualquier residente de la unidad ve todas sus visitas, no solo las que creó', async () => {
    const { service, prisma } = setup();

    await service.list(LUIS, { tab: 'historial', page: 1, pageSize: 10 }, NOW);

    const { where } = prisma.visit.findMany.mock.calls[0][0];
    expect(where.unitId).toBe('unit-1');
    expect(where).not.toHaveProperty('createdById');
  });

  it('AC5: otro residente de la unidad puede cancelar una autorización que no creó', async () => {
    const { service, prisma } = setup();

    await service.cancel(LUIS, 'visit-1', NOW);

    expect(prisma.visit.updateMany).toHaveBeenCalledWith({
      where: { id: 'visit-1', unitId: 'unit-1', status: 'AUTORIZADA' },
      data: { status: 'CANCELADA', cancelledAt: NOW, cancelledById: 'res-2' },
    });
  });

  it('AC5: otro residente de la unidad puede responder la solicitud de portería', async () => {
    const { service, prisma } = setup();

    await service.respond(LUIS, 'visit-1', { decision: 'APROBAR' }, NOW);

    const { where, data } = prisma.visit.updateMany.mock.calls[0][0];
    expect(where).toMatchObject({ id: 'visit-1', unitId: 'unit-1' });
    expect(where).not.toHaveProperty('createdById');
    expect(data.respondedById).toBe('res-2');
  });

  it('AC10: un residente de otra unidad no ve las visitas ajenas: la consulta usa su propia unidad', async () => {
    const { service, prisma } = setup();
    const otra = {
      id: 'res-9',
      role: Role.RESIDENTE,
      unitId: 'unit-9',
    } as User;

    await service.list(otra, { tab: 'activas', page: 1, pageSize: 10 }, NOW);

    expect(prisma.visit.findMany.mock.calls[0][0].where.unitId).toBe('unit-9');
  });
});
