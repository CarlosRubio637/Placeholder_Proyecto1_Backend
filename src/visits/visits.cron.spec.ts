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
