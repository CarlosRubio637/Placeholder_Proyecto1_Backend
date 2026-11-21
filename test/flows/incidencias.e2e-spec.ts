import type { INestApplication } from '@nestjs/common';
import {
  JPEG,
  PNG,
  api,
  createTestApp,
  login,
  resetData,
  uploadedFiles,
} from '../support/app.js';

/**
 * Flujo de negocio H10 → H30 → H31 → H11, con base y archivos reales:
 * un residente reporta, la administración recibe el aviso y lo atiende, y la
 * unidad consulta su incidencia. Los pasos dependen de los anteriores.
 */
describe('Flujo de incidencias (H10, H30, H31, H11)', () => {
  let app: INestApplication;
  let residente1: string; // A-101
  let residente2: string; // A-101, misma unidad
  let residente3: string; // A-102, otra unidad
  let admin: string;
  let seguridad: string;

  const TITLE = 'Fuga de agua en el pasillo';
  const report = (token: string) =>
    api(app, token)
      .post('incidencias')
      .field('title', TITLE)
      .field('description', 'Sale agua del techo desde esta mañana.')
      .field('location', 'TORRE_A')
      .field('locationDetail', 'Piso 1');

  const withPhotos = (test: ReturnType<typeof report>) =>
    test
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('photos', JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });

  let incidentId: string;
  let incidentNumber: string;
  let photoIds: string[];
  let notificationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [residente1, residente2, residente3, admin, seguridad] = await Promise.all([
      login(app, 'residente1'),
      login(app, 'residente2'),
      login(app, 'residente3'),
      login(app, 'admin'),
      login(app, 'seguridad1'),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('H10: rechazos, sin dejar datos ni archivos', () => {
    it('401 sin sesión', async () => {
      await api(app).post('incidencias').expect(401);
    });

    it('403 para Seguridad y Administración', async () => {
      for (const token of [seguridad, admin]) {
        const { body } = await withPhotos(report(token)).expect(403);
        expect(body).toMatchObject({ code: 'FORBIDDEN' });
      }
    });

    it('400 sin fotografías', async () => {
      const { body } = await report(residente1).expect(400);
      expect(body).toMatchObject({
        field: 'photos',
        message: ['Agrega al menos una fotografía.'],
      });
    });

    it('400 si el archivo no es imagen aunque diga que es PNG', async () => {
      const { body } = await report(residente1)
        .attach('photos', Buffer.from('esto es texto'), {
          filename: 'virus.png',
          contentType: 'image/png',
        })
        .expect(400);
      expect(body).toMatchObject({
        field: 'photos',
        message: ['Solo se permiten imágenes JPG o PNG de hasta 5 MB.'],
      });
    });

    it('400 con más de 3 fotografías', async () => {
      const { body } = await withPhotos(withPhotos(report(residente1))).expect(
        400,
      );
      expect(body).toMatchObject({ field: 'photos' });
    });

    it('400 si intenta elegir la unidad (la unidad sale de la sesión)', async () => {
      const { body } = await withPhotos(report(residente1))
        .field('unitId', '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11')
        .expect(400);
      expect(body).toMatchObject({ field: 'unitId' });
    });

    it('ningún rechazo dejó archivos ni avisos', async () => {
      expect(uploadedFiles()).toEqual([]);
      const { body } = await api(app, admin)
        .get('notificaciones/no-leidas/conteo')
        .expect(200);
      expect(body).toEqual({ count: 0 });
    });
  });

  describe('H10: registro', () => {
    it('crea la incidencia con número, estado inicial y fotos en disco', async () => {
      const { body } = await withPhotos(report(residente1)).expect(201);

      expect(body.number).toMatch(/^INC-\d{4}-00001$/);
      expect(body).toMatchObject({
        title: TITLE,
        location: 'TORRE_A',
        status: 'PENDIENTE',
      });
      expect(body.photos).toHaveLength(2);
      expect(uploadedFiles()).toHaveLength(2);

      incidentId = body.id;
      incidentNumber = body.number;
      photoIds = body.photos.map((photo: { id: string }) => photo.id);
    });
  });

  describe('H30 y H31: aviso a la administración', () => {
    it('la administración recibe un aviso con el texto y la referencia', async () => {
      const count = await api(app, admin)
        .get('notificaciones/no-leidas/conteo')
        .expect(200);
      expect(count.body).toEqual({ count: 1 });

      const { body } = await api(app, admin).get('notificaciones').expect(200);
      expect(body.total).toBe(1);
      expect(body.data[0]).toMatchObject({
        title: `Nueva incidencia ${incidentNumber}`,
        message: `La unidad A-101 reportó “${TITLE}” en Torre A.`,
        sourceModule: 'INCIDENCIAS',
        referenceType: 'incident',
        referenceId: incidentId,
        readAt: null,
      });
      notificationId = body.data[0].id;
    });

    it('los residentes no reciben el aviso', async () => {
      const { body } = await api(app, residente1)
        .get('notificaciones/no-leidas/conteo')
        .expect(200);
      expect(body).toEqual({ count: 0 });
    });

    it('otro usuario no puede marcar el aviso ajeno (404)', async () => {
      await api(app, residente1)
        .patch(`notificaciones/${notificationId}/leida`)
        .expect(404);
    });

    it('marcarla como leída baja el conteo y es idempotente', async () => {
      const first = await api(app, admin)
        .patch(`notificaciones/${notificationId}/leida`)
        .expect(200);
      expect(first.body.readAt).toEqual(expect.any(String));

      const second = await api(app, admin)
        .patch(`notificaciones/${notificationId}/leida`)
        .expect(200);
      expect(second.body.readAt).toBe(first.body.readAt);

      const { body } = await api(app, admin)
        .get('notificaciones/no-leidas/conteo')
        .expect(200);
      expect(body).toEqual({ count: 0 });
    });

    it('desde la referencia del aviso abre el detalle, sin revelar cuentas internas', async () => {
      const { body } = await api(app, admin)
        .get(`incidencias/${incidentId}`)
        .expect(200);

      const me = await api(app, residente1).get('auth/me').expect(200);
      expect(body).toMatchObject({
        number: incidentNumber,
        locationDetail: 'Piso 1',
        unit: { code: 'A-101' },
        assignee: null,
      });
      expect(body.events).toHaveLength(1);
      expect(body.events[0].authorLabel).toBe(me.body.fullName);
    });
  });

  describe('H11: consulta de la unidad', () => {
    it('otro residente de la misma unidad la ve en "Mis incidencias"', async () => {
      const { body } = await api(app, residente2)
        .get('incidencias/mias')
        .expect(200);
      expect(body.total).toBe(1);
      expect(body.data[0]).toMatchObject({
        id: incidentId,
        number: incidentNumber,
      });
    });

    it('el filtro por estado funciona', async () => {
      const pendiente = await api(app, residente1)
        .get('incidencias/mias?status=PENDIENTE')
        .expect(200);
      expect(pendiente.body.total).toBe(1);

      const resuelto = await api(app, residente1)
        .get('incidencias/mias?status=RESUELTO')
        .expect(200);
      expect(resuelto.body.total).toBe(0);
    });

    it('un filtro inválido responde 400 con el campo', async () => {
      const { body } = await api(app, residente1)
        .get('incidencias/mias?status=INVENTADO')
        .expect(400);
      expect(body).toMatchObject({ field: 'status' });
    });

    it('la unidad descarga exactamente la foto que se subió', async () => {
      const { headers, body } = await api(app, residente2)
        .get(`incidencias/fotos/${photoIds[0]}`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(headers['content-type']).toContain('image/png');
      expect(Buffer.compare(body as Buffer, PNG)).toBe(0);
    });

    it('otra unidad no la ve: lista vacía y 404 en detalle y foto', async () => {
      const list = await api(app, residente3)
        .get('incidencias/mias')
        .expect(200);
      expect(list.body).toMatchObject({ total: 0, data: [] });

      await api(app, residente3).get(`incidencias/${incidentId}`).expect(404);
      await api(app, residente3)
        .get(`incidencias/fotos/${photoIds[0]}`)
        .expect(404);
    });

    it('Seguridad no tiene acceso (403)', async () => {
      await api(app, seguridad).get(`incidencias/${incidentId}`).expect(403);
      await api(app, seguridad)
        .get(`incidencias/fotos/${photoIds[0]}`)
        .expect(403);
      await api(app, seguridad).get('incidencias/mias').expect(403);
    });
  });

  describe('Segunda incidencia', () => {
    it('el número es consecutivo y llega otro aviso', async () => {
      const { body } = await withPhotos(report(residente3)).expect(201);
      expect(body.number).toMatch(/^INC-\d{4}-00002$/);

      const count = await api(app, admin)
        .get('notificaciones/no-leidas/conteo')
        .expect(200);
      expect(count.body).toEqual({ count: 1 });
    });

    it('marcar todas como leídas deja el conteo en cero', async () => {
      const { body } = await api(app, admin)
        .patch('notificaciones/leidas')
        .expect(200);
      expect(body).toEqual({ updated: 1 });
    });
  });
});
