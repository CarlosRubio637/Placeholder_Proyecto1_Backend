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

const TOWER_B = { id: 'tower-b', name: 'Torre B', letter: 'B' };

const adminAnnouncement = {
  id: ANNOUNCEMENT_ID,
  title: 'Mantenimiento de ascensores',
  category: 'MANTENIMIENTO',
  audience: 'TORRES',
  publishedAt: new Date('2026-11-07T15:30:00.000Z'),
  expiresOn: TODAY,
  towers: [{ tower: TOWER_B }],
};

function setupAdmin() {
  const announcements = {
    findMany: vi
      .fn()
      .mockResolvedValue([
        adminAnnouncement,
        { ...adminAnnouncement, id: 'sin-destinatarios', towers: [] },
      ]),
    count: vi.fn().mockResolvedValue(2),
    findUnique: vi
      .fn()
      .mockResolvedValue({ ...adminAnnouncement, body: 'El lunes no hay.' }),
  };
  const recipients = {
    groupBy: vi
      .fn()
      .mockResolvedValue([
        { announcementId: ANNOUNCEMENT_ID, _count: { _all: 12, readAt: 3 } },
      ]),
    findMany: vi.fn().mockResolvedValue([
      {
        readAt: FIRST_READ,
        unit: { code: 'B-101' },
        user: { profile: { fullName: 'Ana Gómez' } },
      },
      { readAt: null, unit: { code: 'B-203' }, user: { profile: null } },
    ]),
    count: vi.fn().mockResolvedValue(2),
  };
  const prisma = {
    announcement: announcements,
    announcementRecipient: recipients,
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const repository = new AnnouncementRepository(
    prisma as unknown as PrismaService,
  );
  return { repository, announcements, recipients };
}

describe('H26. Comunicados publicados y control de lecturas', () => {
  it('AC4: las lecturas cuentan solo destinatarios con readAt y los destinatarios cuentan todas sus filas', async () => {
    const { repository, recipients } = setupAdmin();
    const { rows } = await repository.listForAdmin({
      today: TODAY,
      skip: 0,
      take: 20,
    });
    expect(recipients.groupBy).toHaveBeenCalledWith({
      by: ['announcementId'],
      where: { announcementId: { in: [ANNOUNCEMENT_ID, 'sin-destinatarios'] } },
      _count: { _all: true, readAt: true },
    });
    expect(
      rows.map(({ readCount, recipientCount }) => [readCount, recipientCount]),
    ).toEqual([
      [3, 12],
      [0, 0],
    ]);
  });
});

describe('consultas de comunicados del administrador', () => {
  it.each([
    ['VIGENTE', { gte: TODAY }],
    ['ARCHIVADO', { lt: TODAY }],
    [undefined, undefined],
  ] as const)(
    'el estado %s filtra el fin de vigencia',
    async (status, expiresOn) => {
      const { repository, announcements } = setupAdmin();
      await repository.listForAdmin({
        status,
        category: 'MANTENIMIENTO',
        today: TODAY,
        skip: 40,
        take: 20,
      });
      const where = { expiresOn, category: 'MANTENIMIENTO' };
      expect(announcements.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
          skip: 40,
          take: 20,
        }),
      );
      expect(announcements.count).toHaveBeenCalledWith({ where });
    },
  );

  it('responde las torres sin la letra', async () => {
    const { repository } = setupAdmin();
    const { rows, total } = await repository.listForAdmin({
      today: TODAY,
      skip: 0,
      take: 20,
    });
    expect(rows[0].towers).toEqual([{ id: 'tower-b', name: 'Torre B' }]);
    expect(total).toBe(2);
  });

  it.each([
    [true, { not: null }],
    [false, null],
    [undefined, undefined],
  ])('read=%s filtra los destinatarios', async (read, readAt) => {
    const { repository, recipients } = setupAdmin();
    await repository.findForReads(ANNOUNCEMENT_ID, {
      read,
      skip: 50,
      take: 50,
    });
    const where = { announcementId: ANNOUNCEMENT_ID, readAt };
    expect(recipients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 50, take: 50 }),
    );
    expect(recipients.count).toHaveBeenCalledWith({ where });
  });

  it('ordena los destinatarios por unidad, nombre e id', async () => {
    const { repository, recipients } = setupAdmin();
    await repository.findForReads(ANNOUNCEMENT_ID, { skip: 0, take: 50 });
    expect(recipients.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { unit: { code: 'asc' } },
          { user: { profile: { fullName: 'asc' } } },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('responde el comunicado con sus conteos y los destinatarios, sin nombre si no hay perfil', async () => {
    const { repository } = setupAdmin();
    const reads = await repository.findForReads(ANNOUNCEMENT_ID, {
      read: false,
      skip: 0,
      take: 50,
    });
    expect(reads.announcement).toMatchObject({
      body: 'El lunes no hay.',
      towers: [{ id: 'tower-b', name: 'Torre B' }],
      readCount: 3,
      recipientCount: 12,
    });
    expect(reads.recipients).toEqual([
      { fullName: 'Ana Gómez', unitCode: 'B-101', readAt: FIRST_READ },
      { fullName: null, unitCode: 'B-203', readAt: null },
    ]);
    expect(reads.total).toBe(2);
  });

  it('un comunicado que no existe lanza AnnouncementNotFoundError sin buscar destinatarios', async () => {
    const { repository, announcements, recipients } = setupAdmin();
    announcements.findUnique.mockResolvedValue(null);
    await expect(
      repository.findForReads(ANNOUNCEMENT_ID, { skip: 0, take: 50 }),
    ).rejects.toBeInstanceOf(AnnouncementNotFoundError);
    expect(recipients.findMany).not.toHaveBeenCalled();
  });
});
