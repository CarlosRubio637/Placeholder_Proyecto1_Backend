import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { NotificationsService } from '../../notifications/index.js';
import type { CommonArea, Reservation, User } from '../../generated/prisma/client.js';
import {
  AreaBlockedError,
  AreaDisabledError,
  AreaNotFoundError,
  SlotTakenError,
  UnitReservationLimitError,
} from '../errors/index.js';
import type { NewReservation, ReservationRepository } from '../repositories/index.js';
import { ReservationsService } from './reservations.service.js';

const resident = { id: 'user-1', unitId: 'unit-1', role: 'RESIDENTE' } as User;
// Viernes 6 de noviembre de 2026, 14:00 en El Salvador.
const NOW = new Date('2026-11-06T20:00:00Z');

const area = {
  id: 'area-1',
  name: 'Piscina',
  capacity: 10,
  openTime: '08:00',
  closeTime: '20:00',
  slotMinutes: 60,
  isActive: true,
} as CommonArea;

const reservation = {
  id: 'res-1',
  code: 'RS-20261106-0001',
  areaId: area.id,
  unitId: 'unit-1',
  userId: 'user-1',
  date: new Date('2026-11-10T00:00:00Z'),
  startTime: '10:00',
  endTime: '11:00',
  attendees: 4,
  status: 'CONFIRMADA',
  createdAt: NOW,
} as Reservation;

const valid = {
  areaId: area.id,
  date: '2026-11-10',
  startTime: '10:00',
  attendees: 4,
  acceptRules: true,
};

/** Repositorio falso que corre `validate` igual que el real. */
function setup(fail?: Error) {
  const create = vi.fn((data: NewReservation) => {
    data.validate(area);
    if (fail) return Promise.reject(fail);
    return Promise.resolve({ reservation, area });
  });
  const send = vi.fn().mockResolvedValue({ created: 1 });
  const service = new ReservationsService(
    { create } as unknown as ReservationRepository,
    { send } as unknown as NotificationsService,
  );
  return { service, create, send };
}

describe('ReservationsService.create', () => {
  it('crea la reserva con la unidad del usuario y avisa al residente', async () => {
    const { service, create, send } = setup();
    const result = await service.create(resident, valid, NOW);

    expect(create.mock.calls[0][0]).toMatchObject({ unitId: 'unit-1', userId: 'user-1', date: '2026-11-10' });
    expect(result).toMatchObject({
      code: 'RS-20261106-0001',
      area: { id: 'area-1', name: 'Piscina' },
      date: '2026-11-10',
      endTime: '11:00',
      status: 'CONFIRMADA',
    });
    expect(send).toHaveBeenCalledWith({
      recipient: { type: 'USUARIO', ids: ['user-1'] },
      title: 'Reserva confirmada',
      message: 'Tu reserva RS-20261106-0001 de Piscina el 10/11/2026 de 10:00 a 11:00 está confirmada.',
      sourceModule: 'RESERVAS',
      reference: { type: 'reservation', id: 'res-1' },
    });
  });

  it('no falla la reserva si el aviso falla', async () => {
    const { service, send } = setup();
    send.mockRejectedValue(new Error('caído'));
    await expect(service.create(resident, valid, NOW)).resolves.toMatchObject({ id: 'res-1' });
  });

  it.each([
    ['fecha pasada', { date: '2026-11-05' }, 'date', 'No puedes reservar una fecha u hora pasada.'],
    ['hora de hoy ya pasada', { date: '2026-11-06', startTime: '14:00' }, 'startTime', 'No puedes reservar una fecha u hora pasada.'],
    ['más de 30 días', { date: '2026-12-07' }, 'date', 'La fecha debe estar entre hoy y 06/12/2026.'],
    ['franja fuera del horario', { startTime: '20:00' }, 'startTime', 'La franja no coincide con el horario del área.'],
    ['franja desalineada', { startTime: '10:30' }, 'startTime', 'La franja no coincide con el horario del área.'],
    ['más personas que el aforo', { attendees: 11 }, 'attendees', 'El área admite máximo 10 personas.'],
    ['menos de 1 persona', { attendees: 0 }, 'attendees', 'El área admite máximo 10 personas.'],
  ])('responde 400 con %s', async (_name, change, field, message) => {
    const promise = setup().service.create(resident, { ...valid, ...change }, NOW);
    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toMatchObject({ response: { field, message: [message] } });
  });

  it('acepta hoy si la franja todavía no empieza y el día 30', async () => {
    const { service } = setup();
    await expect(service.create(resident, { ...valid, date: '2026-11-06', startTime: '15:00' }, NOW)).resolves.toBeDefined();
    await expect(service.create(resident, { ...valid, date: '2026-12-06' }, NOW)).resolves.toBeDefined();
  });

  it('responde 403 si el usuario no tiene unidad', async () => {
    await expect(setup().service.create({ ...resident, unitId: null }, valid, NOW)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    [new AreaDisabledError('area-1'), 'El área está deshabilitada.'],
    [new AreaBlockedError('area-1', '2026-11-10'), 'El área está bloqueada por mantenimiento en esa fecha.'],
    [new UnitReservationLimitError('unit-1'), 'Tu unidad ya tiene 2 reservas activas.'],
    [new SlotTakenError('k'), 'Esta franja ya fue reservada por otra unidad.'],
  ])('traduce %s a 409', async (error, message) => {
    const { service, send } = setup(error);
    const promise = service.create(resident, valid, NOW);
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({ message });
    expect(send).not.toHaveBeenCalled();
  });

  it('traduce el área inexistente a 404', async () => {
    await expect(setup(new AreaNotFoundError('x')).service.create(resident, valid, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});
