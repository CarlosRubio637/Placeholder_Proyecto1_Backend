import { NotFoundException } from '@nestjs/common';
import { toDbDate } from '@Common/time';
import { AnnouncementReadsService } from './announcement-reads.service.js';
import type { AnnouncementRepository } from '../repositories/index.js';
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

  it('AC4: el detalle trae las lecturas de todo el comunicado aunque la tabla filtre', async () => {
    const { service } = setup();
    const reads = await service.readers(ANNOUNCEMENT_ID, {
      read: false,
      page: 1,
      pageSize: 50,
    });
    expect(reads.announcement).toMatchObject({
      readCount: 3,
      recipientCount: 12,
      readPct: 25,
    });
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
