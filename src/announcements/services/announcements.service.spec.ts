import { BadRequestException, Logger } from '@nestjs/common';
import type { User } from '@PrismaClient';
import type { NotificationsService } from '@Notifications';
import { AnnouncementsService } from './announcements.service.js';
import { buildAnnouncementNotification } from './announcement-notification.js';
import type { AnnouncementRepository } from '../repositories/index.js';
import { TowerNotFoundError } from '../errors/index.js';
import { ANNOUNCEMENT_MESSAGES } from '../announcements.constants.js';
import type { CreateAnnouncementDto } from '../dto/index.js';

const NOW = new Date('2026-12-01T03:00:00.000Z');
const admin = { id: 'admin-1', role: 'ADMINISTRADOR' } as User;
const TOWER_A = '0b6f4c1e-8a57-4b55-9a52-5a3f4c7d2e11';
const MISSING = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const dto = {
  title: 'Corte de agua el 4 de diciembre',
  body: 'No habrá agua de 08:00 a 16:00 en la Torre A.',
  category: 'CORTE_SERVICIO',
  audience: 'TORRES',
  towerIds: [TOWER_A],
  expiresOn: '2026-12-14',
} satisfies CreateAnnouncementDto;

function published(expiresOn = '2026-12-14') {
  return {
    id: 'ann-1',
    title: dto.title,
    body: dto.body,
    category: dto.category,
    audience: dto.audience,
    publishedAt: NOW,
    expiresOn: new Date(`${expiresOn}T00:00:00.000Z`),
    createdById: 'admin-1',
    towers: [{ id: TOWER_A, name: 'Torre A', letter: 'A' }],
    recipientCount: 7,
  };
}

function setup() {
  const repository = {
    countRecipients: vi.fn().mockResolvedValue(7),
    publish: vi
      .fn()
      .mockImplementation((data: { expiresOn: Date }) =>
        Promise.resolve(published(data.expiresOn.toISOString().slice(0, 10))),
      ),
  };
  const notifications = { send: vi.fn().mockResolvedValue({ created: 7 }) };
  const service = new AnnouncementsService(
    repository as unknown as AnnouncementRepository,
    notifications as unknown as NotificationsService,
  );
  return { service, repository, notifications };
}

async function badRequestOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse() as {
    field: string;
    message: string[];
  };
}

describe('servicio de comunicados', () => {
  it.each([['2026-12-01'], ['2027-02-28']])(
    'acepta la vigencia %s (de mañana a hoy más 90 días)',
    async (expiresOn) => {
      const { service } = setup();
      const result = await service.publish(admin, { ...dto, expiresOn }, NOW);
      expect(result.expiresOn).toBe(expiresOn);
    },
  );

  it.each([['2026-11-30'], ['2027-03-01']])(
    'rechaza la vigencia %s (hoy o hoy más 91 días)',
    async (expiresOn) => {
      const { service, repository } = setup();
      const response = await badRequestOf(
        service.publish(admin, { ...dto, expiresOn }, NOW),
      );
      expect(response).toMatchObject({
        field: 'expiresOn',
        message: ['La vigencia debe terminar entre mañana y 28/02/2027.'],
      });
      expect(repository.publish).not.toHaveBeenCalled();
    },
  );

  it('rechaza torres con la audiencia TODOS', async () => {
    const { service } = setup();
    const response = await badRequestOf(
      service.publish(admin, { ...dto, audience: 'TODOS' }, NOW),
    );
    expect(response).toMatchObject({
      field: 'towerIds',
      message: [ANNOUNCEMENT_MESSAGES.towerIdsWithAll],
    });
  });

  it('responde 400 con el id de una torre que no existe al publicar', async () => {
    const { service, repository } = setup();
    repository.publish.mockRejectedValue(new TowerNotFoundError(MISSING));
    const response = await badRequestOf(service.publish(admin, dto, NOW));
    expect(response).toMatchObject({
      field: 'towerIds',
      message: [`No existe la torre ${MISSING}.`],
    });
  });

  it('responde 400 con el id de una torre que no existe al contar la audiencia', async () => {
    const { service, repository } = setup();
    repository.countRecipients.mockRejectedValue(
      new TowerNotFoundError(MISSING),
    );
    const response = await badRequestOf(
      service.countAudience({ towerIds: [MISSING] }),
    );
    expect(response.field).toBe('towerIds');
  });

  it('cuenta la audiencia de las torres pedidas', async () => {
    const { service, repository } = setup();
    expect(await service.countAudience({ towerIds: [TOWER_A] })).toEqual({
      recipientCount: 7,
    });
    expect(repository.countRecipients).toHaveBeenCalledWith([TOWER_A]);
  });

  it('publica con el administrador y la fecha como día', async () => {
    const { service, repository } = setup();
    await service.publish(admin, dto, NOW);
    expect(repository.publish).toHaveBeenCalledWith({
      title: dto.title,
      body: dto.body,
      category: 'CORTE_SERVICIO',
      audience: 'TORRES',
      towerIds: [TOWER_A],
      expiresOn: new Date('2026-12-14T00:00:00.000Z'),
      createdById: 'admin-1',
    });
  });

  it('publica TODOS sin torres', async () => {
    const { service, repository } = setup();
    const { towerIds: _towerIds, ...rest } = dto;
    await service.publish(admin, { ...rest, audience: 'TODOS' }, NOW);
    expect(repository.publish.mock.calls[0][0].towerIds).toEqual([]);
  });

  it('devuelve el comunicado con sus torres y el conteo', async () => {
    const { service } = setup();
    expect(await service.publish(admin, dto, NOW)).toEqual({
      id: 'ann-1',
      title: dto.title,
      category: 'CORTE_SERVICIO',
      audience: 'TORRES',
      towers: [{ id: TOWER_A, name: 'Torre A' }],
      publishedAt: NOW,
      expiresOn: '2026-12-14',
      recipientCount: 7,
    });
  });

  it('avisa después de publicar', async () => {
    const { service, notifications } = setup();
    await service.publish(admin, dto, NOW);
    expect(notifications.send).toHaveBeenCalledWith(
      buildAnnouncementNotification({
        id: 'ann-1',
        title: dto.title,
        category: 'CORTE_SERVICIO',
        audience: 'TORRES',
        expiresOn: '2026-12-14',
        towerIds: [TOWER_A],
      }),
    );
  });

  it('responde aunque el aviso falle', async () => {
    const { service, notifications } = setup();
    notifications.send.mockRejectedValue(new Error('base caída'));
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const result = await service.publish(admin, dto, NOW);
    expect(result.id).toBe('ann-1');
    expect(logError).toHaveBeenCalledOnce();
    logError.mockRestore();
  });
});
