import { NotFoundException } from '@nestjs/common';
import { NotificationInboxService } from './notification-inbox.service.js';
import type { NotificationInboxRepository } from '../repositories/index.js';
import type { ListNotificationsQueryDto } from '../dto/index.js';
import type { Notification } from '../../generated/prisma/client.js';

const USER = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const NOTIF = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
const READ_AT = new Date('2026-11-05T15:00:00Z');

const notification: Notification = {
  id: NOTIF,
  userId: USER,
  title: 'Nueva incidencia INC-2026-00001',
  message: 'La unidad A-101 reportó “Fuga de agua” en Torre A.',
  sourceModule: 'INCIDENCIAS',
  referenceType: 'incident',
  referenceId: '0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d',
  readAt: null,
  createdAt: new Date('2026-11-05T14:00:00Z'),
};

function setup() {
  const repository = {
    findPage: vi.fn().mockResolvedValue({ items: [notification], total: 41 }),
    countUnread: vi.fn().mockResolvedValue(3),
    markRead: vi.fn().mockResolvedValue({ id: NOTIF, readAt: READ_AT }),
    markAllRead: vi.fn().mockResolvedValue(5),
  };
  const service = new NotificationInboxService(
    repository as unknown as NotificationInboxRepository,
  );
  return { service, repository };
}

const query = (q: Partial<ListNotificationsQueryDto> = {}) =>
  ({ page: 1, pageSize: 20, ...q }) as ListNotificationsQueryDto;

describe('NotificationInboxService', () => {
  describe('list', () => {
    it('consulta solo las del usuario y devuelve { data, total, page, pageSize }', async () => {
      const { service, repository } = setup();

      const result = await service.list(USER, query());

      expect(repository.findPage).toHaveBeenCalledWith(USER, {
        sourceModule: undefined,
        unread: undefined,
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [
          {
            id: NOTIF,
            title: notification.title,
            message: notification.message,
            sourceModule: 'INCIDENCIAS',
            referenceType: 'incident',
            referenceId: notification.referenceId,
            readAt: null,
            createdAt: notification.createdAt,
          },
        ],
        total: 41,
        page: 1,
        pageSize: 20,
      });
    });

    it('no expone el userId en la respuesta', async () => {
      const { service } = setup();
      const { data } = await service.list(USER, query());
      expect(data[0]).not.toHaveProperty('userId');
    });

    it('pasa los filtros y calcula el salto de la página', async () => {
      const { service, repository } = setup();

      await service.list(
        USER,
        query({ sourceModule: 'CUOTAS', unread: true, page: 3, pageSize: 20 }),
      );

      expect(repository.findPage).toHaveBeenCalledWith(USER, {
        sourceModule: 'CUOTAS',
        unread: true,
        skip: 40,
        take: 20,
      });
    });
  });

  it('countUnread devuelve { count }', async () => {
    const { service, repository } = setup();
    await expect(service.countUnread(USER)).resolves.toEqual({ count: 3 });
    expect(repository.countUnread).toHaveBeenCalledWith(USER);
  });

  describe('markRead', () => {
    it('devuelve { id, readAt } de la notificación del usuario', async () => {
      const { service, repository } = setup();

      await expect(service.markRead(USER, NOTIF)).resolves.toEqual({
        id: NOTIF,
        readAt: READ_AT,
      });
      expect(repository.markRead).toHaveBeenCalledWith(USER, NOTIF);
    });

    it('responde 404 si no existe o es de otro usuario', async () => {
      const { service, repository } = setup();
      repository.markRead.mockResolvedValue(null);

      await expect(service.markRead(USER, NOTIF)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('markAllRead devuelve cuántas cambió', async () => {
    const { service, repository } = setup();
    await expect(service.markAllRead(USER)).resolves.toEqual({ updated: 5 });
    expect(repository.markAllRead).toHaveBeenCalledWith(USER);
  });
});
