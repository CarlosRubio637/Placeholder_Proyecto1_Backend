import type { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '../../src/common/time/index.js';
import { api, createTestApp, inbox, login, resetData } from '../support/app.js';

/** Flujo H14 → H30 → H31: el residente autoriza y Seguridad recibe el aviso. */
describe('Flujo de visitas (H14, H30, H31)', () => {
  let app: INestApplication;
  let residente1: string; // A-101
  let residente3: string; // A-102
  let seguridad1: string;
  let seguridad2: string;
  let admin: string;

  const visitDate = addDays(todayIso(), 3);
  const authorize = (token: string, change: object = {}) =>
    api(app, token)
      .post('visitas')
      .send({
        visitorName: 'Rosa Martínez',
        documentType: 'DUI',
        documentNumber: '01234567-8',
        visitDate,
        expectedTime: '15:30',
        reason: 'Visita familiar',
        ...change,
      });

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [residente1, residente3, seguridad1, seguridad2, admin] = await Promise.all(
      [
        login(app, 'residente1'),
        login(app, 'residente3'),
        login(app, 'seguridad1'),
        login(app, 'seguridad2'),
        login(app, 'admin'),
      ],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it.each<[string, object, string]>([
    ['un DUI mal formado', { documentNumber: '123' }, 'documentNumber'],
    ['una fecha pasada', { visitDate: addDays(todayIso(), -1) }, 'visitDate'],
    ['una hora fuera de horario', { expectedTime: '23:00' }, 'expectedTime'],
    ['una hora fuera de los pasos', { expectedTime: '15:10' }, 'expectedTime'],
  ])('rechaza %s (400)', async (_caso, change, field) => {
    const { body } = await authorize(residente1, change).expect(400);
    expect(body).toMatchObject({ field });
  });

  it('Seguridad y Administración no autorizan visitas (403)', async () => {
    await authorize(seguridad1).expect(403);
    await authorize(admin).expect(403);
  });

  let code: string;

  it('autoriza la visita con un código y su ventana de validez', async () => {
    const { body } = await authorize(residente1).expect(201);
    expect(body.code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(body).toMatchObject({
      status: 'AUTORIZADA',
      visitorName: 'Rosa Martínez',
      visitDate,
      expectedTime: '15:30',
    });
    // 06:00 a 22:00 de ese día en El Salvador (UTC-6).
    expect(body.validFrom).toBe(`${visitDate}T12:00:00.000Z`);
    expect(body.validUntil).toBe(`${addDays(visitDate, 1)}T04:00:00.000Z`);
    code = body.code;
  });

  it('avisa a todo el personal de Seguridad y a nadie más', async () => {
    for (const token of [seguridad1, seguridad2]) {
      const notifications = await inbox(app, token);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Visita autorizada: A-101');
      expect(notifications[0].message).toContain(code);
    }
    await expect(inbox(app, admin)).resolves.toEqual([]);
    await expect(inbox(app, residente3)).resolves.toEqual([]);
  });

  it('no permite repetir el visitante en la misma fecha (409)', async () => {
    const { body } = await authorize(residente1).expect(409);
    expect(body.message).toBe(
      'Este visitante ya tiene una autorización para esa fecha.',
    );
  });
});
