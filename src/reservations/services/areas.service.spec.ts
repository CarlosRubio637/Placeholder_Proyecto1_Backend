import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { NotificationsService } from '../../notifications/index.js';
import type { User } from '../../generated/prisma/client.js';
import {
  AffectedReservationsError,
  AreaNameTakenError,
  AreaNotFoundError,
  BlockNotFoundError,
} from '../errors/index.js';
import type { AreaRepository } from '../repositories/index.js';
import { AreasService } from './areas.service.js';

const admin = { id: 'admin-1' } as User;
// Viernes 6 de noviembre de 2026, 14:00 en El Salvador.
const NOW = new Date('2026-11-06T20:00:00Z');

const area = {
  id: 'area-1',
  name: 'Piscina',
  nameKey: 'piscina',
  capacity: 30,
  rules: null,
  openTime: '08:00',
  closeTime: '20:00',
  slotMinutes: 60,
  isActive: true,
  updatedById: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function setup(repo: Partial<AreaRepository>) {
  const send = vi.fn().mockResolvedValue({ created: 1 });
  const service = new AreasService(
    repo as AreaRepository,
    { send } as unknown as NotificationsService,
  );
  return { service, send };
}

const validArea = {
  name: 'Piscina',
  capacity: 30,
  openTime: '08:00',
  closeTime: '20:00',
  slotMinutes: 60,
};

describe('AreasService.create', () => {
  it('guarda el nameKey sin tildes ni mayúsculas', async () => {
    const create = vi.fn().mockResolvedValue(area);
    await setup({ create }).service.create(admin, { ...validArea, name: 'Salón de Eventos' });
    expect(create.mock.calls[0][0]).toMatchObject({ nameKey: 'salon de eventos', isActive: true, rules: null });
  });

  it('responde 400 en closeTime si el horario no se divide en franjas', async () => {
    const promise = setup({}).service.create(admin, { ...validArea, closeTime: '19:00', slotMinutes: 120 });
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toMatchObject({
      response: { field: 'closeTime', message: ['El horario debe dividirse en franjas completas de 120 minutos.'] },
    });
  });

  it('traduce el nombre repetido a 409', async () => {
    const create = vi.fn().mockRejectedValue(new AreaNameTakenError('Piscina'));
    await expect(setup({ create }).service.create(admin, validArea)).rejects.toThrow(
      new ConflictException('Ya existe un área con ese nombre.'),
    );
  });
});

describe('AreasService.update', () => {
  it('responde 409 RESERVAS_AFECTADAS con la cantidad', async () => {
    const updateWithCancellations = vi.fn().mockRejectedValue(new AffectedReservationsError(3));
    const promise = setup({ updateWithCancellations }).service.update(admin, 'area-1', { isActive: false }, NOW);
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'RESERVAS_AFECTADAS', affectedCount: 3 },
    });
  });

  it('pasa confirmCancellations, recalcula nameKey y avisa a cada residente', async () => {
    const cancelled = [
      { id: 'r1', code: 'RS-20261107-0001', userId: 'u1', date: new Date('2026-11-07T00:00:00Z'), areaName: 'Piscina', reason: 'el área fue deshabilitada por la administración' },
      { id: 'r2', code: 'RS-20261108-0002', userId: 'u2', date: new Date('2026-11-08T00:00:00Z'), areaName: 'Piscina', reason: 'el área fue deshabilitada por la administración' },
    ];
    const updateWithCancellations = vi.fn().mockResolvedValue({ area, cancelled });
    const { service, send } = setup({ updateWithCancellations });

    const result = await service.update(admin, 'area-1', { name: 'Píscina', isActive: false, confirmCancellations: true }, NOW);

    expect(updateWithCancellations.mock.calls[0][0]).toMatchObject({
      confirm: true,
      changes: { name: 'Píscina', nameKey: 'piscina', isActive: false },
      clock: { today: '2026-11-06', time: '14:00' },
    });
    expect(result.cancelledReservations).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toEqual({
      recipient: { type: 'USUARIO', ids: ['u1'] },
      title: 'Reserva cancelada por la administración',
      message: 'Tu reserva RS-20261107-0001 de Piscina el 07/11/2026 fue cancelada: el área fue deshabilitada por la administración.',
      sourceModule: 'RESERVAS',
      reference: { type: 'reservation', id: 'r1' },
    });
  });

  it('si un aviso falla, la cancelación igual se reporta', async () => {
    const cancelled = [{ id: 'r1', code: 'RS-1', userId: 'u1', date: new Date('2026-11-07T00:00:00Z'), areaName: 'Piscina', reason: 'x' }];
    const { service, send } = setup({ updateWithCancellations: vi.fn().mockResolvedValue({ area, cancelled }) });
    send.mockRejectedValue(new Error('caído'));
    await expect(service.update(admin, 'area-1', { isActive: false, confirmCancellations: true }, NOW)).resolves.toMatchObject({ cancelledReservations: 1 });
  });

  it('traduce el área inexistente a 404', async () => {
    const updateWithCancellations = vi.fn().mockRejectedValue(new AreaNotFoundError('x'));
    await expect(setup({ updateWithCancellations }).service.update(admin, 'x', {}, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AreasService.createBlock', () => {
  const block = (startDate: string, endDate: string) => ({ startDate, endDate, reason: 'Mantenimiento de la bomba' });

  it.each([
    ['inicio pasado', block('2026-11-05', '2026-11-07'), 'startDate', 'La fecha de inicio no puede ser anterior a hoy.'],
    ['fin antes del inicio', block('2026-11-10', '2026-11-09'), 'endDate', 'La fecha de fin no puede ser anterior a la de inicio.'],
    ['más de 90 días', block('2026-11-06', '2027-02-04'), 'endDate', 'El bloqueo puede durar máximo 90 días.'],
  ])('responde 400 con %s', async (_case, dto, field, message) => {
    const promise = setup({}).service.createBlock(admin, 'area-1', dto, NOW);
    await expect(promise).rejects.toMatchObject({ response: { field, message: [message] } });
  });

  it('acepta hoy y exactamente 90 días, y quita el punto final del motivo en el aviso', async () => {
    const createBlockWithCancellations = vi.fn().mockResolvedValue({
      block: { id: 'b1', areaId: 'area-1', startDate: new Date('2026-11-06T00:00:00Z'), endDate: new Date('2027-02-03T00:00:00Z'), reason: 'Pintura.', createdById: 'admin-1', createdAt: NOW },
      cancelled: [{ id: 'r1', code: 'RS-20261110-0001', userId: 'u1', date: new Date('2026-11-10T00:00:00Z'), areaName: 'Piscina', reason: 'Pintura.' }],
    });
    const { service, send } = setup({ createBlockWithCancellations });
    const result = await service.createBlock(admin, 'area-1', { ...block('2026-11-06', '2027-02-03'), confirmCancellations: true }, NOW);
    expect(result).toEqual({
      block: { id: 'b1', startDate: '2026-11-06', endDate: '2027-02-03', reason: 'Pintura.' },
      cancelledReservations: 1,
    });
    expect(send.mock.calls[0][0].message).toBe('Tu reserva RS-20261110-0001 de Piscina el 10/11/2026 fue cancelada: Pintura.');
  });
});

describe('AreasService.deleteBlock', () => {
  it('traduce el bloqueo inexistente a 404', async () => {
    const deleteBlock = vi.fn().mockRejectedValue(new BlockNotFoundError('b1'));
    await expect(setup({ deleteBlock }).service.deleteBlock('area-1', 'b1')).rejects.toThrow(
      new NotFoundException('El bloqueo no existe.'),
    );
  });
});
