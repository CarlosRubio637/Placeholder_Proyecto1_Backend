import type { PrismaService } from '@Prisma/services';
import { NotificationValidationError } from '../errors/index.js';
import {
  RecipientType,
  SourceModule,
  type NotificationRecipient,
} from '../notifications.types.js';
import {
  NotificationRepository,
  type CreateNotificationsData,
} from './notification.repository.js';

const USER_A = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const USER_B = '0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const UNIT_A101 = '1d2c3b4a-5f6e-4d7c-8b9a-0f1e2d3c4b5a';
const TOWER_A = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const INCIDENT = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
const MISSING = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

/** Cliente de transacción simulado: lo que se lee y lo que se escribe. */
function setup() {
  const tx = {
    user: { findMany: vi.fn() },
    unit: { findMany: vi.fn() },
    tower: { findMany: vi.fn() },
    notification: {
      createMany: vi.fn(({ data }: { data: unknown[] }) =>
        Promise.resolve({ count: data.length }),
      ),
    },
  };
  const $transaction = vi.fn((fn: (client: typeof tx) => unknown) => fn(tx));
  const prisma = { $transaction } as unknown as PrismaService;
  return { repository: new NotificationRepository(prisma), tx, $transaction };
}

function data(recipient: NotificationRecipient): CreateNotificationsData {
  return {
    recipient,
    title: 'Nueva incidencia INC-2026-00001',
    message: 'La unidad A-101 reportó "Fuga de agua" en Torre A.',
    sourceModule: SourceModule.INCIDENCIAS,
    referenceType: 'incident',
    referenceId: INCIDENT,
  };
}

const ACTIVE_RESIDENT = { role: 'RESIDENTE', isActive: true };

describe('H30. Servicio interno de envío de avisos para los demás módulos', () => {
  it('AC3: USUARIO resuelve a los usuarios indicados; una cuenta desactivada no recibe', async () => {
    const { repository, tx } = setup();
    tx.user.findMany.mockResolvedValue([
      { id: USER_A, isActive: true },
      { id: USER_B, isActive: false },
    ]);

    const created = await repository.createForRecipient(
      data({ type: RecipientType.USUARIO, ids: [USER_A, USER_B] }),
    );

    expect(created).toBe(1);
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: [USER_A, USER_B] } },
      select: { id: true, isActive: true },
    });
    expect(tx.notification.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('AC3: UNIDAD resuelve a los residentes activos de las unidades indicadas', async () => {
    const { repository, tx } = setup();
    tx.unit.findMany.mockResolvedValue([{ id: UNIT_A101 }]);
    tx.user.findMany.mockResolvedValue([{ id: USER_A }, { id: USER_B }]);

    const created = await repository.createForRecipient(
      data({ type: RecipientType.UNIDAD, ids: [UNIT_A101] }),
    );

    expect(created).toBe(2);
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: { unitId: { in: [UNIT_A101] }, ...ACTIVE_RESIDENT },
      select: { id: true },
    });
  });

  it('AC3: TORRES resuelve a los residentes activos de las unidades de esas torres', async () => {
    const { repository, tx } = setup();
    tx.tower.findMany.mockResolvedValue([{ id: TOWER_A }]);
    tx.user.findMany.mockResolvedValue([{ id: USER_A }]);

    await repository.createForRecipient(
      data({ type: RecipientType.TORRES, ids: [TOWER_A] }),
    );

    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: { unit: { towerId: { in: [TOWER_A] } }, ...ACTIVE_RESIDENT },
      select: { id: true },
    });
  });

  it('AC3: TODOS resuelve a todos los residentes activos', async () => {
    const { repository, tx } = setup();
    tx.user.findMany.mockResolvedValue([{ id: USER_A }, { id: USER_B }]);

    const created = await repository.createForRecipient(
      data({ type: RecipientType.TODOS, ids: [] }),
    );

    expect(created).toBe(2);
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: ACTIVE_RESIDENT,
      select: { id: true },
    });
  });

  it('AC4: crea una notificación No leída por destinatario, con módulo y referencia, en una sola operación', async () => {
    const { repository, tx, $transaction } = setup();
    tx.unit.findMany.mockResolvedValue([{ id: UNIT_A101 }]);
    tx.user.findMany.mockResolvedValue([{ id: USER_A }, { id: USER_B }]);

    await repository.createForRecipient(
      data({ type: RecipientType.UNIDAD, ids: [UNIT_A101] }),
    );

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.notification.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      [USER_A, USER_B].map((userId) => ({
        userId,
        title: 'Nueva incidencia INC-2026-00001',
        message: 'La unidad A-101 reportó "Fuga de agua" en Torre A.',
        sourceModule: 'INCIDENCIAS',
        referenceType: 'incident',
        referenceId: INCIDENT,
      })),
    );
    // Sin readAt (No leída) ni createdAt: la base pone la fecha y hora de creación.
    for (const row of rows) {
      expect(row).not.toHaveProperty('readAt');
      expect(row).not.toHaveProperty('createdAt');
    }
  });

  it('AC4: si nadie resulta destinatario, no escribe nada y devuelve 0', async () => {
    const { repository, tx } = setup();
    tx.user.findMany.mockResolvedValue([]);

    await expect(
      repository.createForRecipient(
        data({ type: RecipientType.TODOS, ids: [] }),
      ),
    ).resolves.toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it.each<[string, NotificationRecipient, 'user' | 'unit' | 'tower']>([
    [
      'un usuario',
      { type: RecipientType.USUARIO, ids: [USER_A, MISSING] },
      'user',
    ],
    [
      'una unidad',
      { type: RecipientType.UNIDAD, ids: [UNIT_A101, MISSING] },
      'unit',
    ],
    [
      'una torre',
      { type: RecipientType.TORRES, ids: [TOWER_A, MISSING] },
      'tower',
    ],
  ])(
    'AC5: si %s no existe, lanza el error con el campo recipient.ids y no crea nada',
    async (_caso, recipient, model) => {
      const { repository, tx } = setup();
      const found = [{ id: recipient.ids[0], isActive: true }];
      tx[model].findMany.mockResolvedValue(found);

      const error = await repository
        .createForRecipient(data(recipient))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotificationValidationError);
      expect((error as NotificationValidationError).field).toBe(
        'recipient.ids',
      );
      expect((error as NotificationValidationError).message).toContain(MISSING);
      expect(tx.notification.createMany).not.toHaveBeenCalled();
    },
  );
});
