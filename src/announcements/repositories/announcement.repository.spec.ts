import type { PrismaService } from '@Prisma/services';
import { toDbDate } from '@Common/time';
import { AnnouncementRepository } from './announcement.repository.js';
import { AnnouncementNotFoundError } from '../errors/index.js';

const USER_ID = 'user-1';
const ANNOUNCEMENT_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';
const TODAY = toDbDate('2026-11-08');
const FIRST_READ = new Date('2026-11-08T16:15:00.000Z');

const announcement = {
  id: ANNOUNCEMENT_ID,
  title: 'Corte de agua el 10 de noviembre',
  body: 'No habrá agua de 08:00 a 16:00.',
  category: 'CORTE_SERVICIO',
  publishedAt: new Date('2026-11-07T15:30:00.000Z'),
  expiresOn: toDbDate('2026-11-08'),
};

function setup() {
  const recipients = {
    findMany: vi.fn().mockResolvedValue([{ readAt: null, announcement }]),
    count: vi.fn().mockResolvedValue(1),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue({ readAt: FIRST_READ, announcement }),
  };
  const prisma = {
    announcementRecipient: recipients,
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const repository = new AnnouncementRepository(
    prisma as unknown as PrismaService,
  );
  return { repository, recipients };
}

describe('consultas de comunicados del residente', () => {
  it('vigentes incluye los que vencen hoy y desempata por id', async () => {
    const { repository, recipients } = setup();
    const result = await repository.listForResident(USER_ID, {
      archived: false,
      category: 'MANTENIMIENTO',
      today: TODAY,
      skip: 20,
      take: 10,
    });
    const where = {
      userId: USER_ID,
      announcement: { expiresOn: { gte: TODAY }, category: 'MANTENIMIENTO' },
    };
    expect(recipients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [
          { announcement: { publishedAt: 'desc' } },
          { announcement: { id: 'asc' } },
        ],
        skip: 20,
        take: 10,
      }),
    );
    expect(recipients.count).toHaveBeenCalledWith({ where });
    expect(result.total).toBe(1);
  });

  it('archivados solo trae los que vencieron antes de hoy', async () => {
    const { repository, recipients } = setup();
    await repository.listForResident(USER_ID, {
      archived: true,
      today: TODAY,
      skip: 0,
      take: 10,
    });
    expect(recipients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: USER_ID,
          announcement: { expiresOn: { lt: TODAY }, category: undefined },
        },
      }),
    );
  });

  it('abrir solo guarda la lectura del residente si estaba vacía', async () => {
    const { repository, recipients } = setup();
    await repository.markRead(USER_ID, ANNOUNCEMENT_ID);
    expect(recipients.updateMany).toHaveBeenCalledWith({
      where: { announcementId: ANNOUNCEMENT_ID, userId: USER_ID, readAt: null },
      data: { readAt: expect.any(Date) as Date },
    });
    expect(recipients.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          announcementId_userId: {
            announcementId: ANNOUNCEMENT_ID,
            userId: USER_ID,
          },
        },
      }),
    );
  });

  it('abrir otra vez devuelve la primera fecha de lectura', async () => {
    const { repository } = setup();
    const detail = await repository.markRead(USER_ID, ANNOUNCEMENT_ID);
    expect(detail.readAt).toBe(FIRST_READ);
    expect(detail.announcement.body).toBe(announcement.body);
  });

  it('abrir uno del que no es destinatario lanza AnnouncementNotFoundError', async () => {
    const { repository, recipients } = setup();
    recipients.findUnique.mockResolvedValue(null);
    await expect(
      repository.markRead(USER_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(AnnouncementNotFoundError);
  });
});
