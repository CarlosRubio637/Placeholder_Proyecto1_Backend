import type { INestApplication } from '@nestjs/common';
import bcrypt from 'bcrypt';
import {
  PASSWORD,
  PNG,
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

/** Flujo H10 → H12 → H13 → H30 → H31 → H11: del reporte a la resolución. */
describe('Flujo de seguimiento de incidencias (H10, H12, H13, H30, H31, H11)', () => {
  let app: INestApplication;
  let admin: string;
  let admin2: string;
  let residente1: string; // A-101, quien reporta
  let residente2: string; // A-101, misma unidad
  let incidentId: string;
  let number: string;
  let pedroId: string;

  const change = (
    token: string,
    toStatus: string,
    expectedStatus: string,
    note = 'Observación de seguimiento de la incidencia.',
  ) =>
    api(app, token)
      .post(`admin/incidencias/${incidentId}/estado`)
      .send({ toStatus, expectedStatus, note });

  const detail = async (token = residente1) => {
    const { body } = await api(app, token)
      .get(`incidencias/${incidentId}`)
      .expect(200);
    return body as {
      status: string;
      resolvedAt: string | null;
      events: {
        type: string;
        fromStatus: string | null;
        toStatus: string | null;
        note: string | null;
        authorLabel: string;
      }[];
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    // Un segundo administrador, para el cambio simultáneo.
    await db(app).user.upsert({
      where: { email: 'admin2@seguimiento.test' },
      update: {},
      create: {
        email: 'admin2@seguimiento.test',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
        role: 'ADMINISTRADOR',
      },
    });
    const response = await api(app)
      .post('auth/login')
      .send({ email: 'admin2@seguimiento.test', password: PASSWORD })
      .expect(200);
    admin2 = response.body.accessToken;
    [admin, residente1, residente2] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'residente2'),
    ]);

    const { body } = await api(app, residente1)
      .post('incidencias')
      .field('title', 'Fuga de agua en el baño')
      .field('description', 'Sale agua debajo del lavamanos.')
      .field('location', 'TORRE_A')
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    incidentId = body.id;
    number = body.number;
    const staff = await api(app, admin).get('admin/responsables').expect(200);
    pedroId = staff.body.data.find(
      (item: { name: string }) => item.name === 'Pedro Alvarado',
    ).id;
  });

  afterAll(async () => {
    await resetData(app);
    await db(app).user.deleteMany({
      where: { email: 'admin2@seguimiento.test' },
    });
    await app.close();
  });

  describe('reglas antes de empezar', () => {
    it('no se puede saltar de Pendiente a Resuelto', async () => {
      const { body } = await change(admin, 'RESUELTO', 'PENDIENTE').expect(409);
      expect(body.message).toBe('No se puede pasar de Pendiente a Resuelto.');
    });

    it('no se puede iniciar la atención sin responsable', async () => {
      const { body } = await change(admin, 'EN_PROCESO', 'PENDIENTE').expect(
        409,
      );
      expect(body.message).toBe(
        'Asigna un responsable antes de iniciar la atención.',
      );
    });

    it('la observación debe tener de 10 a 500 caracteres', async () => {
      const { body } = await change(
        admin,
        'EN_PROCESO',
        'PENDIENTE',
        'Corta',
      ).expect(400);
      expect(body).toMatchObject({
        field: 'note',
        message: ['Escribe una observación de 10 a 500 caracteres.'],
      });
    });

    it('ninguno de los rechazos dejó eventos ni avisos', async () => {
      const { events } = await detail();
      expect(events.map((event) => event.type)).toEqual(['CREACION']);
      await expect(inbox(app, residente1)).resolves.toEqual([]);
    });
  });

  describe('atención', () => {
    it('con responsable (H12) pasa a En proceso y guarda la observación', async () => {
      await api(app, admin)
        .patch(`admin/incidencias/${incidentId}`)
        .send({ assigneeId: pedroId })
        .expect(200);

      const { body } = await change(
        admin,
        'EN_PROCESO',
        'PENDIENTE',
        'Se envió al fontanero para revisar la tubería.',
      ).expect(201);

      expect(body.incident).toEqual({
        id: incidentId,
        status: 'EN_PROCESO',
        resolvedAt: null,
      });
      expect(body.event).toMatchObject({
        fromStatus: 'PENDIENTE',
        toStatus: 'EN_PROCESO',
        note: 'Se envió al fontanero para revisar la tubería.',
      });
    });

    it('avisa solo al residente que reportó', async () => {
      const notifications = await inbox(app, residente1);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        title: `Incidencia ${number}: En proceso`,
        message:
          'Tu reporte “Fuga de agua en el baño” pasó a En proceso. Se envió al fontanero para revisar la tubería.',
        sourceModule: 'INCIDENCIAS',
        referenceType: 'incident',
        referenceId: incidentId,
      });
      await expect(inbox(app, residente2)).resolves.toEqual([]);
    });

    it('la unidad ve el evento en el historial (H11), firmado por Administración', async () => {
      const { status, events } = await detail(residente2);
      expect(status).toBe('EN_PROCESO');
      expect(events.at(-1)).toMatchObject({
        type: 'ESTADO',
        fromStatus: 'PENDIENTE',
        toStatus: 'EN_PROCESO',
        note: 'Se envió al fontanero para revisar la tubería.',
        authorLabel: 'Administración',
      });
    });

    it('con el estado viejo en pantalla responde que cambió', async () => {
      const { body } = await change(admin, 'EN_PROCESO', 'PENDIENTE').expect(
        409,
      );
      expect(body.message).toBe(
        'La incidencia cambió de estado. Actualiza la página.',
      );
    });
  });

  describe('resolución', () => {
    it('dos administradores a la vez: solo se aplica el primero', async () => {
      const results = await Promise.all([
        change(
          admin,
          'RESUELTO',
          'EN_PROCESO',
          'Se cambió la tubería del lavamanos.',
        ),
        change(
          admin2,
          'RESUELTO',
          'EN_PROCESO',
          'Se selló la fuga con silicón.',
        ),
      ]);
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      const rejected = results.find((result) => result.status === 409);
      expect(rejected?.body.message).toBe(
        'La incidencia cambió de estado. Actualiza la página.',
      );

      const { status, resolvedAt, events } = await detail();
      expect(status).toBe('RESUELTO');
      expect(resolvedAt).toEqual(expect.any(String));
      expect(
        events.filter((event) => event.toStatus === 'RESUELTO'),
      ).toHaveLength(1);
    });

    it('resuelta, ya no se cambian prioridad ni responsable (H12)', async () => {
      const { body } = await api(app, admin)
        .patch(`admin/incidencias/${incidentId}`)
        .send({ priority: 'ALTA' })
        .expect(409);
      expect(body.message).toBe(
        'La incidencia está resuelta. Reábrela para modificarla.',
      );
    });

    it('reabrir la vuelve a En proceso y borra resolvedAt', async () => {
      const { body } = await change(
        admin,
        'EN_PROCESO',
        'RESUELTO',
        'La fuga volvió a aparecer esta mañana.',
      ).expect(201);
      expect(body.incident).toEqual({
        id: incidentId,
        status: 'EN_PROCESO',
        resolvedAt: null,
      });

      const { resolvedAt } = await detail();
      expect(resolvedAt).toBeNull();
      const [latest] = await inbox(app, residente1);
      expect(latest.title).toBe(`Incidencia ${number}: En proceso`);
    });

    it('el historial cuenta toda la historia en orden', async () => {
      const { events } = await detail();
      expect(
        events.map((event) =>
          event.type === 'ESTADO'
            ? `${event.fromStatus}>${event.toStatus}`
            : event.type,
        ),
      ).toEqual([
        'CREACION',
        'ASIGNACION',
        'PENDIENTE>EN_PROCESO',
        'EN_PROCESO>RESUELTO',
        'RESUELTO>EN_PROCESO',
      ]);
      await expect(inbox(app, residente1)).resolves.toHaveLength(3);
    });
  });
});
