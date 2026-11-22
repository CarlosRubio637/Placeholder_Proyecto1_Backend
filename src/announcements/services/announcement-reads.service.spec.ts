import { NotFoundException } from '@nestjs/common';
import { toDbDate } from '@Common/time';
import type { PrismaService } from '@Prisma/services';
import type { User } from '@PrismaClient';
import { AnnouncementReadsService } from './announcement-reads.service.js';
import { ResidentAnnouncementsService } from './resident-announcements.service.js';
import { AnnouncementRepository } from '../repositories/index.js';
import { AnnouncementNotFoundError } from '../errors/index.js';

const ANNOUNCEMENT_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';
const PUBLISHED = new Date('2026-11-10T15:30:00.000Z');
const READ = new Date('2026-11-11T16:15:00.000Z');
const SV_2330_NOV_18 = new Date('2026-11-19T05:30:00.000Z');

function row(overrides: object = {}) {
  return {
    id: ANNOUNCEMENT_ID,
    title: 'Mantenimiento de ascensores',
    category: 'MANTENIMIENTO' as const,
    audience: 'TORRES' as const,
    towers: [{ id: 'tower-b', name: 'Torre B' }],
    publishedAt: PUBLISHED,
    expiresOn: toDbDate('2026-11-18'),
    readCount: 3,
    recipientCount: 12,
    ...overrides,
  };
}

function setup() {
  const repository = {
    listForAdmin: vi.fn().mockResolvedValue({ rows: [row()], total: 1 }),
    findForReads: vi.fn().mockResolvedValue({
      announcement: { ...row(), body: 'El lunes no habrá servicio.' },
      recipients: [
        { fullName: 'Ana Gómez', unitCode: 'B-101', readAt: READ },
        { fullName: null, unitCode: 'B-203', readAt: null },
      ],
      total: 2,
    }),
  };
  const service = new AnnouncementReadsService(
    repository as unknown as AnnouncementRepository,
  );
  return { service, repository };
}

interface RecipientRecord {
  userId: string;
  fullName: string;
  unitCode: string;
  readAt: Date | null;
}

interface RecipientKey {
  where: { announcementId_userId: { userId: string } };
}

interface RecipientReadUpdate {
  where: { userId: string; readAt: null };
  data: { readAt: Date };
}

function setupWithRecipients() {
  const announcement = {
    id: ANNOUNCEMENT_ID,
    title: 'Mantenimiento de ascensores',
    body: 'El lunes no habrá servicio.',
    category: 'MANTENIMIENTO',
    audience: 'TORRES',
    towers: [{ tower: { id: 'tower-b', name: 'Torre B' } }],
    publishedAt: PUBLISHED,
    expiresOn: toDbDate('2026-11-18'),
  };
  const recipients: RecipientRecord[] = [
    {
      userId: 'user-1',
      fullName: 'Ana Gómez',
      unitCode: 'B-101',
      readAt: READ,
    },
    {
      userId: 'user-2',
      fullName: 'Luis Pérez',
      unitCode: 'B-102',
      readAt: null,
    },
    {
      userId: 'user-3',
      fullName: 'Marta Ruiz',
      unitCode: 'B-203',
      readAt: null,
    },
  ];
  const announcementRecipient = {
    groupBy: vi.fn(() =>
      Promise.resolve([
        {
          announcementId: ANNOUNCEMENT_ID,
          _count: {
            _all: recipients.length,
            readAt: recipients.filter((recipient) => recipient.readAt !== null)
              .length,
          },
        },
      ]),
    ),
    findMany: vi.fn(() =>
      Promise.resolve(
        recipients.map((recipient) => ({
          readAt: recipient.readAt,
          unit: { code: recipient.unitCode },
          user: { profile: { fullName: recipient.fullName } },
        })),
      ),
    ),
    count: vi.fn(() => Promise.resolve(recipients.length)),
    updateMany: vi.fn(({ where, data }: RecipientReadUpdate) => {
      const unread = recipients.filter(
        (recipient) =>
          recipient.userId === where.userId &&
          recipient.readAt === where.readAt,
      );
      for (const recipient of unread) recipient.readAt = data.readAt;
      return Promise.resolve({ count: unread.length });
    }),
    findUnique: vi.fn(({ where }: RecipientKey) => {
      const recipient = recipients.find(
        (candidate) => candidate.userId === where.announcementId_userId.userId,
      );
      return Promise.resolve(
        recipient && { readAt: recipient.readAt, announcement },
      );
    }),
  };
  const prisma = {
    announcement: {
      findMany: vi.fn().mockResolvedValue([announcement]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(announcement),
    },
    announcementRecipient,
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const repository = new AnnouncementRepository(
    prisma as unknown as PrismaService,
  );
  return {
    reads: new AnnouncementReadsService(repository),
    residents: new ResidentAnnouncementsService(repository),
    announcementRecipient,
  };
}

describe('H26. Comunicados publicados y control de lecturas', () => {
  it.each([
    [3, 12, 25],
    [2, 3, 66.7],
    [1, 8, 12.5],
    [12, 12, 100],
    [0, 0, 0],
  ])(
    'AC4: %i lecturas de %i destinatarios dan %d %%',
    async (readCount, recipientCount, readPct) => {
      const { service, repository } = setup();
      repository.listForAdmin.mockResolvedValue({
        rows: [row({ readCount, recipientCount })],
        total: 1,
      });
      const page = await service.list({ page: 1, pageSize: 20 });
      expect(page.data[0]).toMatchObject({
        readCount,
        recipientCount,
        readPct,
      });
    },
  );

  it('AC5: las cifras se recalculan en cada consulta con los readAt que marca la lectura del residente en H27', async () => {
    const { reads, residents, announcementRecipient } = setupWithRecipients();
    const before = await reads.list({ page: 1, pageSize: 20 });
    expect(before.data[0]).toMatchObject({
      readCount: 1,
      recipientCount: 3,
      readPct: 33.3,
    });

    const luis = { id: 'user-2', role: 'RESIDENTE' } as User;
    const opened = await residents.read(luis, ANNOUNCEMENT_ID);

    const after = await reads.list({ page: 1, pageSize: 20 });
    expect(after.data[0]).toMatchObject({
      readCount: 2,
      recipientCount: 3,
      readPct: 66.7,
    });
    const detail = await reads.readers(ANNOUNCEMENT_ID, {
      page: 1,
      pageSize: 50,
    });
    expect(detail.announcement).toMatchObject({
      readCount: 2,
      recipientCount: 3,
      readPct: 66.7,
    });
    expect(detail.data.map((recipient) => recipient.readAt)).toEqual([
      READ,
      opened.readAt,
      null,
    ]);
    expect(announcementRecipient.groupBy).toHaveBeenCalledTimes(3);
    expect(announcementRecipient.groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({ _count: { _all: true, readAt: true } }),
    );
  });
});

describe('comunicados del administrador', () => {
  it('a las 23:30 de El Salvador el que vence hoy sigue Vigente', async () => {
    const { service, repository } = setup();
    repository.listForAdmin.mockResolvedValue({
      rows: [
        row({ expiresOn: toDbDate('2026-11-18') }),
        row({ id: 'otro', expiresOn: toDbDate('2026-11-17') }),
      ],
      total: 2,
    });
    const page = await service.list(
      { status: 'VIGENTE', page: 1, pageSize: 20 },
      SV_2330_NOV_18,
    );
    expect(repository.listForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'VIGENTE',
        today: toDbDate('2026-11-18'),
      }),
    );
    expect(page.data.map((announcement) => announcement.status)).toEqual([
      'VIGENTE',
      'ARCHIVADO',
    ]);
  });

  it('la página 3 de 20 pide skip 40 con la categoría', async () => {
    const { service, repository } = setup();
    await service.list({ category: 'MANTENIMIENTO', page: 3, pageSize: 20 });
    expect(repository.listForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        status: undefined,
        category: 'MANTENIMIENTO',
        skip: 40,
        take: 20,
      }),
    );
  });

  it('responde la fila con las torres y expiresOn en AAAA-MM-DD', async () => {
    const { service } = setup();
    const page = await service.list({ page: 2, pageSize: 5 }, SV_2330_NOV_18);
    expect(page).toEqual({
      data: [
        {
          id: ANNOUNCEMENT_ID,
          title: 'Mantenimiento de ascensores',
          category: 'MANTENIMIENTO',
          audience: 'TORRES',
          towers: [{ id: 'tower-b', name: 'Torre B' }],
          publishedAt: PUBLISHED,
          expiresOn: '2026-11-18',
          status: 'VIGENTE',
          readCount: 3,
          recipientCount: 12,
          readPct: 25,
        },
      ],
      total: 1,
      page: 2,
      pageSize: 5,
    });
  });
});

describe('lecturas de un comunicado', () => {
  it('pide la página con el filtro de lectura', async () => {
    const { service, repository } = setup();
    await service.readers(ANNOUNCEMENT_ID, {
      read: true,
      page: 2,
      pageSize: 50,
    });
    expect(repository.findForReads).toHaveBeenCalledWith(ANNOUNCEMENT_ID, {
      read: true,
      skip: 50,
      take: 50,
    });
  });

  it('responde el comunicado completo y sus destinatarios', async () => {
    const { service } = setup();
    const reads = await service.readers(
      ANNOUNCEMENT_ID,
      { page: 1, pageSize: 50 },
      SV_2330_NOV_18,
    );
    expect(reads).toEqual({
      announcement: {
        id: ANNOUNCEMENT_ID,
        title: 'Mantenimiento de ascensores',
        body: 'El lunes no habrá servicio.',
        category: 'MANTENIMIENTO',
        audience: 'TORRES',
        towers: [{ id: 'tower-b', name: 'Torre B' }],
        publishedAt: PUBLISHED,
        expiresOn: '2026-11-18',
        status: 'VIGENTE',
        readCount: 3,
        recipientCount: 12,
        readPct: 25,
      },
      data: [
        { fullName: 'Ana Gómez', unitCode: 'B-101', readAt: READ },
        { fullName: null, unitCode: 'B-203', readAt: null },
      ],
      total: 2,
      page: 1,
      pageSize: 50,
    });
  });

  it('un comunicado que no existe responde 404 con "El comunicado no existe."', async () => {
    const { service, repository } = setup();
    repository.findForReads.mockRejectedValue(
      new AnnouncementNotFoundError(ANNOUNCEMENT_ID),
    );
    const error = await service
      .readers(ANNOUNCEMENT_ID, { page: 1, pageSize: 50 })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(
      'El comunicado no existe.',
    );
  });
});
