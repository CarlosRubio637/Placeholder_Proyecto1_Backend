import type { INestApplication } from '@nestjs/common';
import {
  addDays,
  currentTime,
  todayIso,
  toDbDate,
} from '../../src/common/time/index.js';
import {
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

/**
 * H8: Mis reservas y cancelación. Cubre los criterios de la card: pestañas,
 * orden, residente que reservó, cancelación con 24 h, 409, 404 entre unidades,
 * la franja que vuelve a quedar disponible y el aviso al residente.
 */
describe('Mis reservas y cancelación (H8)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string; // A-101
  let residente2: string; // A-101
  let residente3: string; // A-102
  let areaId: string;

  const far = addDays(todayIso(), 5);
  const farther = addDays(todayIso(), 6);

  const reserve = (token: string, date: string, startTime: string) =>
    api(app, token)
      .post('reservas')
      .send({ areaId, date, startTime, attendees: 2, acceptRules: true })
      .expect(201)
      .then((res) => res.body as { id: string; code: string });

  const mine = (token: string, query = '') =>
    api(app, token).get(`reservas/mias${query}`);

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, residente2, residente3] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'residente2'),
      login(app, 'residente3'),
    ]);
    const { body } = await api(app, admin)
      .post('admin/areas')
      .send({
        name: 'Rancho H8',
        capacity: 10,
        openTime: '08:00',
        closeTime: '14:00',
        slotMinutes: 60,
      })
      .expect(201);
    areaId = body.id;
  });

  afterAll(async () => {
    await resetData(app);
    await app.close();
  });

  it('sin reservas, las dos pestañas vienen vacías', async () => {
    for (const tab of ['proximas', 'historial']) {
      const { body } = await mine(residente1, `?tab=${tab}`).expect(200);
      expect(body).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
    }
  });

  it('Próximas: de la más cercana a la más lejana, visibles para toda la unidad', async () => {
    const later = await reserve(residente1, farther, '09:00');
    const sooner = await reserve(residente2, far, '10:00');

    const { body } = await mine(residente1).expect(200);
    expect(body.total).toBe(2);
    expect(body.data.map((r: { id: string }) => r.id)).toEqual([
      sooner.id,
      later.id,
    ]);
    expect(body.data[0]).toMatchObject({
      code: sooner.code,
      area: { id: areaId, name: 'Rancho H8' },
      date: far,
      startTime: '10:00',
      endTime: '11:00',
      attendees: 2,
      status: 'CONFIRMADA',
      reservedBy: expect.any(String),
      canCancel: true,
    });
    // reservedBy dice quién de la unidad reservó.
    expect(body.data[0].reservedBy).not.toBe(body.data[1].reservedBy);
  });

  it('otra unidad no ve las reservas ni las puede cancelar (404)', async () => {
    const { body } = await mine(residente3).expect(200);
    expect(body.total).toBe(0);

    const { body: own } = await mine(residente1).expect(200);
    const res = await api(app, residente3)
      .patch(`reservas/${own.data[0].id}/cancelar`)
      .expect(404);
    expect(res.body.message).toBe('La reserva no existe.');
  });

  it('cancelar libera la franja, guarda autor y avisa a quien reservó', async () => {
    const { body: list } = await mine(residente1).expect(200);
    const target = list.data[0]; // la reservó residente2

    const { body } = await api(app, residente1)
      .patch(`reservas/${target.id}/cancelar`)
      .expect(200);
    expect(body).toMatchObject({
      id: target.id,
      status: 'CANCELADA',
      cancelledAt: expect.any(String),
    });

    const row = await db(app).reservation.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(row.slotKey).toBeNull();
    expect(row.cancelledById).not.toBeNull();

    const { body: slots } = await api(app, residente3)
      .get(`areas/${areaId}/disponibilidad?date=${far}`)
      .expect(200);
    expect(
      slots.slots.find((s: { startTime: string }) => s.startTime === '10:00')
        .status,
    ).toBe('DISPONIBLE');

    const [notification] = await inbox(app, residente2);
    expect(notification).toMatchObject({
      title: 'Reserva cancelada',
      sourceModule: 'RESERVAS',
      referenceId: target.id,
    });
    expect(notification.message).toBe(
      `Tu reserva ${target.code} de Rancho H8 el ${far.split('-').reverse().join('/')} fue cancelada.`,
    );

    const { body: history } = await mine(residente1, '?tab=historial').expect(
      200,
    );
    expect(history.data[0]).toMatchObject({
      id: target.id,
      status: 'CANCELADA',
      canCancel: false,
    });
  });

  it('una reserva ya cancelada no se vuelve a cancelar (409)', async () => {
    const { body: history } = await mine(residente1, '?tab=historial').expect(
      200,
    );
    const res = await api(app, residente1)
      .patch(`reservas/${history.data[0].id}/cancelar`)
      .expect(409);
    expect(res.body.message).toBe('La reserva ya está cancelada.');
  });

  it('tampoco una Cancelada por administración (409)', async () => {
    const r = await reserve(residente1, far, '12:00');
    await db(app).reservation.update({
      where: { id: r.id },
      data: {
        status: 'CANCELADA_ADMIN',
        slotKey: null,
        cancelledAt: new Date(),
      },
    });
    await api(app, residente1).patch(`reservas/${r.id}/cancelar`).expect(409);
  });

  it('con menos de 24 horas no se cancela (409) y canCancel es false', async () => {
    const { body: list } = await mine(residente1).expect(200);
    const target = list.data[0];
    // Que empiece dentro de 2 horas, en hora del condominio.
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await db(app).reservation.update({
      where: { id: target.id },
      data: {
        date: toDbDate(todayIso(soon)),
        startTime: currentTime(soon),
        endTime: currentTime(new Date(soon.getTime() + 60 * 60 * 1000)),
        slotKey: `${areaId}|soon`,
      },
    });

    const { body } = await mine(residente1).expect(200);
    expect(
      body.data.find((r: { id: string }) => r.id === target.id).canCancel,
    ).toBe(false);

    const res = await api(app, residente1)
      .patch(`reservas/${target.id}/cancelar`)
      .expect(409);
    expect(res.body.message).toBe(
      'Solo puedes cancelar con al menos 24 horas de anticipación.',
    );
  });

  it('Historial: pasadas y canceladas, de la más reciente a la más antigua', async () => {
    const past = await reserve(residente1, far, '13:00');
    await db(app).reservation.update({
      where: { id: past.id },
      data: {
        date: toDbDate(addDays(todayIso(), -3)),
        slotKey: `${areaId}|past`,
      },
    });

    const { body } = await mine(residente1, '?tab=historial').expect(200);
    const dates = body.data.map((r: { date: string }) => r.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(body.data.at(-1)).toMatchObject({
      id: past.id,
      status: 'CONFIRMADA',
      canCancel: false,
    });

    const { body: upcoming } = await mine(residente1).expect(200);
    expect(upcoming.data.map((r: { id: string }) => r.id)).not.toContain(
      past.id,
    );
  });

  it('pagina de a 10 por defecto y respeta pageSize', async () => {
    const { body } = await mine(
      residente1,
      '?tab=historial&page=1&pageSize=1',
    ).expect(200);
    expect(body.data).toHaveLength(1);
    expect(body.pageSize).toBe(1);
    expect(body.total).toBeGreaterThan(1);
  });

  it.each([
    ['?tab=todas', 'tab'],
    ['?page=0', 'page'],
    ['?pageSize=51', 'pageSize'],
  ])('rechaza el filtro inválido %s (400)', async (query, field) => {
    const { body } = await mine(residente1, query).expect(400);
    expect(body.field).toBe(field);
  });

  it('un id inexistente responde 404', async () => {
    await api(app, residente1)
      .patch('reservas/3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11/cancelar')
      .expect(404);
  });
});
