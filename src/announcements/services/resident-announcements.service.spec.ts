import { NotFoundException } from '@nestjs/common';
import type { User } from '@PrismaClient';
import { toDbDate } from '@Common/time';
import { ResidentAnnouncementsService } from './resident-announcements.service.js';
import type { AnnouncementRepository } from '../repositories/index.js';
import { AnnouncementNotFoundError } from '../errors/index.js';
import type { ResidentAnnouncementsQueryDto } from '../dto/index.js';

const resident = { id: 'user-1', role: 'RESIDENTE' } as User;
const ANNOUNCEMENT_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';
const PUBLISHED = new Date('2026-11-07T15:30:00.000Z');
const READ = new Date('2026-11-08T16:15:00.000Z');

const announcement = {
  id: ANNOUNCEMENT_ID,
  title: 'Corte de agua el 10 de noviembre',
  category: 'CORTE_SERVICIO' as const,
  publishedAt: PUBLISHED,
  expiresOn: toDbDate('2026-11-14'),
};

function query(
  overrides: Partial<ResidentAnnouncementsQueryDto> = {},
): ResidentAnnouncementsQueryDto {
  return { tab: 'vigentes', page: 1, pageSize: 10, ...overrides };
}

function setup() {
  const repository = {
    listForResident: vi.fn().mockResolvedValue({
      rows: [{ readAt: null, announcement }],
      total: 1,
    }),
    markRead: vi.fn().mockResolvedValue({
      readAt: READ,
      announcement: {
        ...announcement,
        body: 'No habrá agua de 08:00 a 16:00.',
      },
    }),
  };
  const service = new ResidentAnnouncementsService(
    repository as unknown as AnnouncementRepository,
  );
  return { service, repository };
}

describe('comunicados del residente', () => {
  it('pide los vigentes con la fecha de hoy de El Salvador', async () => {
    const { service, repository } = setup();
    await service.list(resident, query(), new Date('2026-11-08T15:00:00.000Z'));
    expect(repository.listForResident).toHaveBeenCalledWith('user-1', {
      archived: false,
      category: undefined,
      today: toDbDate('2026-11-08'),
      skip: 0,
      take: 10,
    });
  });

  it('a las 21:00 de El Salvador hoy sigue siendo el mismo día', async () => {
    const { service, repository } = setup();
    await service.list(resident, query(), new Date('2026-11-09T03:00:00.000Z'));
    expect(repository.listForResident).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ today: toDbDate('2026-11-08') }),
    );
  });

  it('archivados y la página 3 de 20 piden skip 40', async () => {
    const { service, repository } = setup();
    await service.list(
      resident,
      query({
        tab: 'archivados',
        category: 'MANTENIMIENTO',
        page: 3,
        pageSize: 20,
      }),
      new Date('2026-11-08T15:00:00.000Z'),
    );
    expect(repository.listForResident).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        archived: true,
        category: 'MANTENIMIENTO',
        skip: 40,
        take: 20,
      }),
    );
  });

  it('responde la página con expiresOn en AAAA-MM-DD', async () => {
    const { service } = setup();
    const page = await service.list(resident, query({ page: 2, pageSize: 5 }));
    expect(page).toEqual({
      data: [
        {
          id: ANNOUNCEMENT_ID,
          title: announcement.title,
          category: 'CORTE_SERVICIO',
          publishedAt: PUBLISHED,
          expiresOn: '2026-11-14',
          readAt: null,
        },
      ],
      total: 1,
      page: 2,
      pageSize: 5,
    });
  });

  it('abrir llama al repositorio con el id del token', async () => {
    const { service, repository } = setup();
    const opened = await service.read(resident, ANNOUNCEMENT_ID);
    expect(repository.markRead).toHaveBeenCalledWith('user-1', ANNOUNCEMENT_ID);
    expect(opened).toEqual({
      id: ANNOUNCEMENT_ID,
      title: announcement.title,
      body: 'No habrá agua de 08:00 a 16:00.',
      category: 'CORTE_SERVICIO',
      publishedAt: PUBLISHED,
      expiresOn: '2026-11-14',
      readAt: READ,
    });
  });

  it('abrir uno ajeno responde 404 con "El comunicado no existe."', async () => {
    const { service, repository } = setup();
    repository.markRead.mockRejectedValue(
      new AnnouncementNotFoundError(ANNOUNCEMENT_ID),
    );
    const error = await service.read(resident, ANNOUNCEMENT_ID).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe(
      'El comunicado no existe.',
    );
  });
});
