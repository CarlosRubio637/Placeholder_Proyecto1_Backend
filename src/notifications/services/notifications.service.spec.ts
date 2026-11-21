import { NotificationsService } from './notifications.service.js';
import { NotificationValidationError } from '../errors/index.js';
import {
  RecipientType,
  SourceModule,
  type SendNotificationInput,
} from '../notifications.types.js';
import type { NotificationRepository } from '../repositories/index.js';

const USER_A = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const USER_B = '0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const INCIDENT = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';

const valid: SendNotificationInput = {
  recipient: { type: RecipientType.USUARIO, ids: [USER_A] },
  title: 'Tu incidencia cambió de estado',
  message: 'La incidencia INC-0001 pasó a "En proceso".',
  sourceModule: SourceModule.INCIDENCIAS,
  reference: { type: 'incident', id: INCIDENT },
};

function setup(created = 1) {
  const createForRecipient = vi.fn().mockResolvedValue(created);
  const repository = {
    createForRecipient,
  } as unknown as NotificationRepository;
  return { service: new NotificationsService(repository), createForRecipient };
}

/** Ejecuta `send` y devuelve el NotificationValidationError que lanzó. */
async function errorOf(input: unknown) {
  const { service, createForRecipient } = setup();
  const error = await service
    .send(input as SendNotificationInput)
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(NotificationValidationError);
  // Si la validación falla no se llega a crear nada.
  expect(createForRecipient).not.toHaveBeenCalled();
  return error as NotificationValidationError;
}

describe('H30. Servicio interno de envío de avisos para los demás módulos', () => {
  it('AC2: recibe destinatario, título, mensaje, módulo y referencia, y devuelve { created }', async () => {
    const { service, createForRecipient } = setup(1);

    const result = await service.send({ ...valid, title: '  Hola  ' });

    expect(result).toEqual({ created: 1 });
    expect(createForRecipient).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: [USER_A] },
      title: 'Hola',
      message: valid.message,
      sourceModule: 'INCIDENCIAS',
      referenceType: 'incident',
      referenceId: INCIDENT,
    });
  });

  it('AC3: quita ids repetidos: un usuario recibe una sola notificación por envío', async () => {
    const { service, createForRecipient } = setup(2);
    await service.send({
      ...valid,
      recipient: { type: 'USUARIO', ids: [USER_A, USER_B, USER_A] },
    });
    expect(createForRecipient.mock.calls[0][0].recipient.ids).toEqual([
      USER_A,
      USER_B,
    ]);
  });

  it('AC2: la referencia es opcional', async () => {
    const { service, createForRecipient } = setup();
    await service.send({ ...valid, reference: undefined });
    expect(createForRecipient.mock.calls[0][0]).toMatchObject({
      referenceType: null,
      referenceId: null,
    });
  });

  it('AC2: en TODOS los ids van vacíos u omitidos', async () => {
    const { service, createForRecipient } = setup(10);
    await expect(
      service.send({ ...valid, recipient: { type: 'TODOS', ids: [] } }),
    ).resolves.toEqual({
      created: 10,
    });
    await service.send({ ...valid, recipient: { type: 'TODOS' } as never });
    expect(createForRecipient).toHaveBeenCalledTimes(2);
  });

  it('AC5: el error tiene la forma { code, message, field } del contrato y no crea nada', async () => {
    const error = await errorOf({ ...valid, title: '' });
    expect(error.toJSON()).toEqual({
      code: 'NOTIFICATION_INVALID',
      field: 'title',
      message: 'El título es obligatorio.',
    });
  });

  it.each<[string, unknown, string]>([
    ['falta el destinatario', { ...valid, recipient: undefined }, 'recipient'],
    [
      'tipo de destinatario inválido',
      { ...valid, recipient: { type: 'VECINOS', ids: [USER_A] } },
      'recipient.type',
    ],
    [
      'ids vacío fuera de TODOS',
      { ...valid, recipient: { type: 'UNIDAD', ids: [] } },
      'recipient.ids',
    ],
    [
      'ids omitido fuera de TODOS',
      { ...valid, recipient: { type: 'TORRES' } },
      'recipient.ids',
    ],
    [
      'id que no es uuid',
      { ...valid, recipient: { type: 'USUARIO', ids: ['A-101'] } },
      'recipient.ids',
    ],
    [
      'TODOS con ids',
      { ...valid, recipient: { type: 'TODOS', ids: [USER_A] } },
      'recipient.ids',
    ],
    [
      'más de 500 ids',
      {
        ...valid,
        recipient: {
          type: 'USUARIO',
          ids: Array.from({ length: 501 }, () => USER_A),
        },
      },
      'recipient.ids',
    ],
    ['falta el título', { ...valid, title: undefined }, 'title'],
    ['título solo con espacios', { ...valid, title: '   ' }, 'title'],
    ['título de 101 caracteres', { ...valid, title: 'x'.repeat(101) }, 'title'],
    ['falta el mensaje', { ...valid, message: '' }, 'message'],
    [
      'mensaje de 501 caracteres',
      { ...valid, message: 'x'.repeat(501) },
      'message',
    ],
    [
      'módulo de origen inválido',
      { ...valid, sourceModule: 'DIRECTORIO' },
      'sourceModule',
    ],
    [
      'falta el módulo de origen',
      { ...valid, sourceModule: undefined },
      'sourceModule',
    ],
    [
      'tipo de referencia vacío',
      { ...valid, reference: { type: '', id: INCIDENT } },
      'reference.type',
    ],
    [
      'tipo de referencia de 31 caracteres',
      { ...valid, reference: { type: 'x'.repeat(31), id: INCIDENT } },
      'reference.type',
    ],
    [
      'id de referencia que no es uuid',
      { ...valid, reference: { type: 'incident', id: '42' } },
      'reference.id',
    ],
  ])('AC5: rechaza el envío si hay %s (campo %s)', async (_caso, input, field) => {
    expect((await errorOf(input)).field).toBe(field);
  });

  it('AC5: acepta los largos máximos exactos', async () => {
    const { service } = setup();
    await expect(
      service.send({
        ...valid,
        title: 'x'.repeat(100),
        message: 'x'.repeat(500),
        reference: { type: 'x'.repeat(30), id: INCIDENT },
        recipient: {
          type: 'USUARIO',
          ids: Array.from({ length: 500 }, () => USER_A),
        },
      }),
    ).resolves.toEqual({ created: 1 });
  });

  it('AC5: si un id no existe, el error del repositorio llega con el campo', async () => {
    const { service, createForRecipient } = setup();
    createForRecipient.mockRejectedValue(
      new NotificationValidationError('recipient.ids', 'No existen…'),
    );
    await expect(service.send(valid)).rejects.toMatchObject({
      field: 'recipient.ids',
    });
  });
});
