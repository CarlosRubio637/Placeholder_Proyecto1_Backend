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

interface Resident {
  id: string;
  unitId: string;
  towerId: string;
}

interface RecipientKey {
  announcementId: string;
  userId: string;
}

interface StoredRecipient extends RecipientKey {
  readAt: Date | null;
}

const ANA: Resident = { id: 'ana', unitId: 'unit-a101', towerId: 'tower-a' };
const LUIS: Resident = { id: 'luis', unitId: 'unit-a102', towerId: 'tower-a' };
const SOFIA: Resident = {
  id: 'sofia',
  unitId: 'unit-a201',
  towerId: 'tower-a',
};
const PEDRO: Resident = {
  id: 'pedro',
  unitId: 'unit-b101',
  towerId: 'tower-b',
};
const VIGENTES = { archived: false, today: TODAY, skip: 0, take: 10 };

function inMemoryCondominium(residents: Resident[]) {
  const stored: StoredRecipient[] = [];
  const recipientsOf = (userId: string) =>
    stored.filter((row) => row.userId === userId);
  const tables = {
    tower: {
      findMany: vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id }))),
      ),
    },
    user: {
      findMany: vi.fn(
        ({ where }: { where: { unit?: { towerId: { in: string[] } } } }) => {
          const towerIds = where.unit?.towerId.in;
          return Promise.resolve(
            residents
              .filter(
                (resident) => !towerIds || towerIds.includes(resident.towerId),
              )
              .map(({ id, unitId }) => ({ id, unitId })),
          );
        },
      ),
    },
    announcement: {
      create: vi.fn(() => Promise.resolve({ ...announcement, towers: [] })),
    },
    announcementRecipient: {
      createMany: vi.fn(({ data }: { data: RecipientKey[] }) => {
        stored.push(
          ...data.map(({ announcementId, userId }) => ({
            announcementId,
            userId,
            readAt: null,
          })),
        );
        return Promise.resolve({ count: data.length });
      }),
      findMany: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          recipientsOf(where.userId).map((row) => ({
            readAt: row.readAt,
            announcement,
          })),
        ),
      ),
      count: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(recipientsOf(where.userId).length),
      ),
      updateMany: vi.fn(
        ({ where, data }: { where: RecipientKey; data: { readAt: Date } }) => {
          const unread = recipientsOf(where.userId).filter(
            (row) =>
              row.announcementId === where.announcementId &&
              row.readAt === null,
          );
          unread.forEach((row) => {
            row.readAt = data.readAt;
          });
          return Promise.resolve({ count: unread.length });
        },
      ),
      findUnique: vi.fn(
        ({ where }: { where: { announcementId_userId: RecipientKey } }) => {
          const key = where.announcementId_userId;
          const row = recipientsOf(key.userId).find(
            (recipient) => recipient.announcementId === key.announcementId,
          );
          return Promise.resolve(
            row ? { readAt: row.readAt, announcement } : null,
          );
        },
      ),
    },
  };
  const prisma = {
    ...tables,
    $transaction: vi.fn(
      (work: ((tx: typeof tables) => Promise<unknown>) | Promise<unknown>[]) =>
        Array.isArray(work) ? Promise.all(work) : work(tables),
    ),
  };
  return new AnnouncementRepository(prisma as unknown as PrismaService);
}

async function publishTo(residents: Resident[], towerIds: string[]) {
  const repository = inMemoryCondominium(residents);
  await repository.publish({
    title: announcement.title,
    body: announcement.body,
    category: 'CORTE_SERVICIO',
    audience: towerIds.length === 0 ? 'TODOS' : 'TORRES',
    towerIds,
    expiresOn: announcement.expiresOn,
    createdById: 'admin-1',
  });
  return repository;
}

describe('H27. Consulta de comunicados relevantes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC1 y AC2: Vigentes incluye los que vencen hoy, filtra por categoría y ordena del más reciente al más antiguo con desempate por id', async () => {
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

  it('AC1: Archivados solo trae los que vencieron antes de hoy', async () => {
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

  it('AC5: abrir solo guarda la lectura del residente si estaba vacía', async () => {
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

  it('AC5: abrir otra vez devuelve la primera fecha de lectura', async () => {
    const { repository } = setup();
    const detail = await repository.markRead(USER_ID, ANNOUNCEMENT_ID);
    expect(detail.readAt).toBe(FIRST_READ);
    expect(detail.announcement.body).toBe(announcement.body);
  });

  it('AC7: abrir uno del que no es destinatario lanza AnnouncementNotFoundError', async () => {
    const { repository, recipients } = setup();
    recipients.findUnique.mockResolvedValue(null);
    await expect(
      repository.markRead(USER_ID, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(AnnouncementNotFoundError);
  });

  it('AC5: la primera apertura fija readAt solo para ese residente y las siguientes no lo cambian', async () => {
    const repository = await publishTo([ANA, LUIS], []);
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(FIRST_READ);
    const first = await repository.markRead(ANA.id, ANNOUNCEMENT_ID);
    vi.setSystemTime(new Date('2026-11-09T14:00:00.000Z'));
    const again = await repository.markRead(ANA.id, ANNOUNCEMENT_ID);

    expect(first.readAt).toEqual(FIRST_READ);
    expect(again.readAt).toEqual(FIRST_READ);
    const ana = await repository.listForResident(ANA.id, VIGENTES);
    const luis = await repository.listForResident(LUIS.id, VIGENTES);
    expect(ana.rows.map((row) => row.readAt)).toEqual([FIRST_READ]);
    expect(luis.rows.map((row) => row.readAt)).toEqual([null]);
  });

  it('AC6: un residente que se registra después de la publicación no recibe ese comunicado', async () => {
    const residents = [ANA];
    const repository = await publishTo(residents, []);
    residents.push(SOFIA);

    expect(await repository.listForResident(ANA.id, VIGENTES)).toMatchObject({
      total: 1,
    });
    expect(await repository.listForResident(SOFIA.id, VIGENTES)).toEqual({
      rows: [],
      total: 0,
    });
    await expect(
      repository.markRead(SOFIA.id, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(AnnouncementNotFoundError);
  });

  it('AC7: un residente de otra torre no ve ni puede abrir un comunicado dirigido solo a la Torre A', async () => {
    const repository = await publishTo([ANA, PEDRO], ['tower-a']);

    expect(await repository.listForResident(PEDRO.id, VIGENTES)).toEqual({
      rows: [],
      total: 0,
    });
    await expect(
      repository.markRead(PEDRO.id, ANNOUNCEMENT_ID),
    ).rejects.toBeInstanceOf(AnnouncementNotFoundError);
    expect(await repository.listForResident(ANA.id, VIGENTES)).toMatchObject({
      total: 1,
    });
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
