import type { PrismaService } from '@Prisma/services';
import { VisitStatus } from '@PrismaClient';
import { VisitsCronService } from './visits.cron.js';

function setup() {
  const visit = { updateMany: vi.fn().mockResolvedValue({ count: 3 }) };
  const cron = new VisitsCronService({ visit } as unknown as PrismaService);
  return { cron, visit };
}

describe('vencimiento de autorizaciones de visita', () => {
  it('pasa a Vencida las Autorizadas cuya vigencia ya terminó', async () => {
    const { cron, visit } = setup();
    const now = new Date('2026-11-09T04:00:00Z'); // 22:00 en El Salvador

    await expect(cron.expireAuthorizations(now)).resolves.toBe(3);
    expect(visit.updateMany).toHaveBeenCalledWith({
      where: { status: VisitStatus.AUTORIZADA, validUntil: { lte: now } },
      data: { status: VisitStatus.VENCIDA },
    });
  });

  it('si la base falla, no lanza: la siguiente corrida lo reintenta', async () => {
    const { cron, visit } = setup();
    visit.updateMany.mockRejectedValue(new Error('caída'));
    await expect(cron.expireAuthorizations()).resolves.toBe(0);
  });
});

describe('H15. Mis visitas: cancelar autorizaciones y responder solicitudes', () => {
  it('AC7: pasa a Rechazada las solicitudes de más de 15 minutos con «Sin respuesta del residente»', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const cron = new VisitsCronService({
      visit: { updateMany },
    } as unknown as PrismaService);
    const now = new Date('2026-11-19T16:00:00Z');

    await expect(cron.expireRequests(now)).resolves.toBe(2);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDIENTE_AUTORIZACION',
        createdAt: { lte: new Date('2026-11-19T15:45:00Z') },
      },
      data: {
        status: 'RECHAZADA',
        rejectReason: 'Sin respuesta del residente',
      },
    });
  });

  it('AC7: un error de base no tumba la tarea; la siguiente corrida lo reintenta', async () => {
    const cron = new VisitsCronService({
      visit: { updateMany: vi.fn().mockRejectedValue(new Error('caída')) },
    } as unknown as PrismaService);
    await expect(cron.expireRequests()).resolves.toBe(0);
  });
});
