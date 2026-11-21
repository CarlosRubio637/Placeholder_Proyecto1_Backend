import type { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '../../src/common/time/index.js';
import { api, createTestApp, inbox, login, resetData } from '../support/app.js';

/** Flujo H9 → H6 → H7 → H9 → H30 → H31: el ciclo de una reserva. */
describe('Flujo de áreas y reservas (H9, H6, H7, H30, H31)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string; // A-101
  let residente2: string; // A-101
  let residente3: string; // A-102
  let residente4: string; // B-101
  let areaId: string;

  const date = addDays(todayIso(), 5);
  const otherDate = addDays(todayIso(), 6);

  const reserve = (
    token: string,
    startTime: string,
    day = date,
    attendees = 4,
  ) =>
    api(app, token)
      .post('reservas')
      .send({ areaId, date: day, startTime, attendees, acceptRules: true });

  const slot = async (token: string, startTime: string, day = date) => {
    const { body } = await api(app, token)
      .get(`areas/${areaId}/disponibilidad?date=${day}`)
      .expect(200);
    return (
      body.slots as {
        startTime: string;
        status: string;
        ownReservationId: string | null;
      }[]
    ).find((item) => item.startTime === startTime);
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, residente2, residente3, residente4] = await Promise.all(
      [
        login(app, 'admin'),
        login(app, 'residente1'),
        login(app, 'residente2'),
        login(app, 'residente3'),
        login(app, 'residente4'),
      ],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('H9: la administración crea un área y el residente la ve', async () => {
    const created = await api(app, admin)
      .post('admin/areas')
      .send({
        name: 'Cancha de pruebas',
        capacity: 10,
        openTime: '08:00',
        closeTime: '14:00',
        slotMinutes: 60,
      })
      .expect(201);
    areaId = created.body.id;

    const { body } = await api(app, residente1).get('areas').expect(200);
    expect(body.data.map((area: { id: string }) => area.id)).toContain(areaId);
  });

  it('H9: el nombre no se puede repetir, ni con otras tildes', async () => {
    await api(app, admin)
      .post('admin/areas')
      .send({
        name: 'cancha de prúebas',
        capacity: 5,
        openTime: '08:00',
        closeTime: '14:00',
        slotMinutes: 60,
      })
      .expect(409);
  });

  it('H6: todas las franjas empiezan disponibles', async () => {
    await expect(slot(residente1, '09:00')).resolves.toMatchObject({
      status: 'DISPONIBLE',
      ownReservationId: null,
    });
  });

  it('H7: el residente reserva y recibe el aviso con el comprobante', async () => {
    const { body } = await reserve(residente1, '09:00').expect(201);
    expect(body).toMatchObject({
      date,
      startTime: '09:00',
      endTime: '10:00',
      status: 'CONFIRMADA',
    });

    const [notification] = await inbox(app, residente1);
    expect(notification).toMatchObject({
      title: 'Reserva confirmada',
      sourceModule: 'RESERVAS',
      referenceId: body.id,
    });
    expect(notification.message).toContain(body.code);
  });

  it('H6: solo la unidad dueña ve la franja como propia', async () => {
    const own = await slot(residente2, '09:00');
    expect(own?.status).toBe('RESERVADO');
    expect(own?.ownReservationId).toEqual(expect.any(String));

    await expect(slot(residente3, '09:00')).resolves.toMatchObject({
      status: 'RESERVADO',
      ownReservationId: null,
    });
  });

  it.each([
    ['más personas que el aforo', '10:00', 11, 'attendees'],
    ['menos de una persona', '10:00', 0, 'attendees'],
    ['una franja fuera del horario', '15:00', 2, 'startTime'],
    ['una hora que no calza con las franjas', '10:30', 2, 'startTime'],
  ])('H7: rechaza %s (400)', async (_caso, startTime, attendees, field) => {
    const { body } = await reserve(
      residente3,
      startTime,
      date,
      attendees,
    ).expect(400);
    expect(body).toMatchObject({ field });
  });

  it('H7: una franja ocupada responde 409', async () => {
    const { body } = await reserve(residente3, '09:00').expect(409);
    expect(body.message).toBe('Esta franja ya fue reservada por otra unidad.');
  });

  it('H7: dos unidades por la misma franja a la vez: gana solo una', async () => {
    const results = await Promise.all([
      reserve(residente3, '11:00'),
      reserve(residente4, '11:00'),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
  });

  it('H7: la unidad no puede tener más de 2 reservas activas, entre sus residentes', async () => {
    await reserve(residente2, '10:00').expect(201);
    const { body } = await reserve(residente1, '12:00').expect(409);
    expect(body.message).toBe('Tu unidad ya tiene 2 reservas activas.');
  });

  it('H9: un bloqueo que afecta reservas exige confirmación', async () => {
    const { body } = await api(app, admin)
      .post(`admin/areas/${areaId}/bloqueos`)
      .send({
        startDate: date,
        endDate: date,
        reason: 'Mantenimiento de la cancha.',
      })
      .expect(409);
    expect(body).toMatchObject({
      code: 'RESERVAS_AFECTADAS',
      affectedCount: 3,
    });
    await expect(slot(residente1, '09:00')).resolves.toMatchObject({
      status: 'RESERVADO',
    });
  });

  let blockId: string;

  it('H9: al confirmar cancela las reservas y avisa a quien reservó', async () => {
    const { body } = await api(app, admin)
      .post(`admin/areas/${areaId}/bloqueos`)
      .send({
        startDate: date,
        endDate: date,
        reason: 'Mantenimiento de la cancha.',
        confirmCancellations: true,
      })
      .expect(201);
    expect(body.cancelledReservations).toBe(3);
    blockId = body.block.id;

    const cancelled = (await inbox(app, residente1)).filter(
      (item) => item.title === 'Reserva cancelada por la administración',
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].message).toContain('Mantenimiento de la cancha.');
  });

  it('H7: en la fecha bloqueada no se puede reservar', async () => {
    await expect(slot(residente1, '09:00')).resolves.toMatchObject({
      status: 'MANTENIMIENTO',
    });
    const { body } = await reserve(residente1, '09:00').expect(409);
    expect(body.message).toBe(
      'El área está bloqueada por mantenimiento en esa fecha.',
    );
  });

  it('H9: al quitar el bloqueo se libera y las reservas canceladas no cuentan', async () => {
    await api(app, admin)
      .delete(`admin/areas/${areaId}/bloqueos/${blockId}`)
      .expect(204);
    await reserve(residente1, '09:00').expect(201);
  });

  it('H9: recortar el horario cancela solo las reservas que quedan fuera', async () => {
    await reserve(residente3, '13:00', otherDate).expect(201);

    const pending = await api(app, admin)
      .patch(`admin/areas/${areaId}`)
      .send({ closeTime: '12:00' })
      .expect(409);
    expect(pending.body).toMatchObject({ affectedCount: 1 });

    const { body } = await api(app, admin)
      .patch(`admin/areas/${areaId}`)
      .send({ closeTime: '12:00', confirmCancellations: true })
      .expect(200);
    expect(body.cancelledReservations).toBe(1);

    await expect(slot(residente1, '09:00')).resolves.toMatchObject({
      status: 'RESERVADO',
    });
  });

  it('H9: un área deshabilitada desaparece del catálogo y no se reserva', async () => {
    await api(app, admin)
      .patch(`admin/areas/${areaId}`)
      .send({ isActive: false, confirmCancellations: true })
      .expect(200);

    const { body } = await api(app, residente3).get('areas').expect(200);
    expect(body.data.map((area: { id: string }) => area.id)).not.toContain(
      areaId,
    );
    await reserve(residente3, '08:00').expect(409);
  });
});
