import type { INestApplication } from '@nestjs/common';
import { todayIso } from '../../src/common/time/index.js';
import { VisitsCronService } from '../../src/visits/visits.cron.js';
import { condominiumInstant } from '../../src/visits/visits.utils.js';
import {
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

const TODAY = todayIso();
/** Las solicitudes de portería solo se aceptan de 06:00 a 22:00. */
const TEN_AM = condominiumInstant(TODAY, '10:00');
const MIN = 60 * 1000;

type Visit = {
  id: string;
  status: string;
  visitorName: string;
  createdBy: string;
  expiresAt: string | null;
  rejectReason: string | null;
  entryAt: string | null;
  code: string | null;
};

/** Flujo H14 → H15 y H16 → H15 → H30 → H31 → H16: mis visitas y solicitudes. */
describe('Flujo de mis visitas (H14, H15, H16, H30, H31)', () => {
  let app: INestApplication;
  let residente1: string; // A-101
  let residente2: string; // A-101
  let residente3: string; // A-102
  let seguridad: string;
  let unitA101: string;

  const mine = async (token: string, tab = 'activas') => {
    const { body } = await api(app, token)
      .get(`visitas/mias?tab=${tab}`)
      .expect(200);
    return body as { data: Visit[]; total: number };
  };
  const respond = (
    token: string,
    id: string,
    decision: string,
    reason?: string,
  ) =>
    api(app, token)
      .post(`visitas/${id}/respuesta`)
      .send(reason ? { decision, reason } : { decision });
  const request = (visitorName: string, documentNumber: string) =>
    api(app, seguridad)
      .post('seguridad/visitas/solicitudes')
      .send({
        visitorName,
        documentType: 'DUI',
        documentNumber,
        reason: 'Entrega a domicilio',
        unitId: unitA101,
      })
      .expect(201)
      .then((res) => res.body.id as string);

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEN_AM });
    app = await createTestApp();
    await resetData(app);
    [residente1, residente2, residente3, seguridad] = await Promise.all([
      login(app, 'residente1'),
      login(app, 'residente2'),
      login(app, 'residente3'),
      login(app, 'seguridad1'),
    ]);
    unitA101 = (
      await db(app).unit.findUniqueOrThrow({ where: { code: 'A-101' } })
    ).id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  describe('autorizaciones (H14 → H15)', () => {
    let visitId: string;

    it('una autorización aparece en Activas para toda la unidad', async () => {
      const me = await api(app, residente1).get('auth/me').expect(200);
      const { body } = await api(app, residente1)
        .post('visitas')
        .send({
          visitorName: 'Rosa Martínez',
          documentType: 'DUI',
          documentNumber: '01234567-8',
          visitDate: TODAY,
          expectedTime: '15:30',
          reason: 'Visita familiar',
        })
        .expect(201);
      visitId = body.id;

      const { data } = await mine(residente2);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        id: visitId,
        status: 'AUTORIZADA',
        code: body.code,
        createdBy: me.body.fullName,
        expiresAt: null,
      });
      await expect(mine(residente3)).resolves.toMatchObject({ total: 0 });
    });

    it('otra unidad no la puede cancelar (404)', async () => {
      await api(app, residente3)
        .patch(`visitas/${visitId}/cancelar`)
        .expect(404);
    });

    it('otro residente de la unidad la cancela y queda en el historial', async () => {
      const { body } = await api(app, residente2)
        .patch(`visitas/${visitId}/cancelar`)
        .expect(200);
      expect(body).toMatchObject({ id: visitId, status: 'CANCELADA' });

      const saved = await db(app).visit.findUniqueOrThrow({
        where: { id: visitId },
        include: { cancelledBy: true },
      });
      expect(saved.cancelledBy?.email).toBe('residente2@condominio.test');
      expect(saved.cancelledAt?.toISOString()).toBe(TEN_AM.toISOString());

      await expect(mine(residente1)).resolves.toMatchObject({ total: 0 });
      const history = await mine(residente1, 'historial');
      expect(history.data[0]).toMatchObject({
        id: visitId,
        status: 'CANCELADA',
      });
    });

    it('cancelarla otra vez responde 409', async () => {
      const { body } = await api(app, residente1)
        .patch(`visitas/${visitId}/cancelar`)
        .expect(409);
      expect(body.message).toBe('Solo se pueden cancelar visitas Autorizadas.');
    });
  });

  describe('solicitudes de portería (H16 → H15 → H16)', () => {
    let requestId: string;

    it('la solicitud aparece primero en Activas, con su vencimiento', async () => {
      await api(app, residente1)
        .post('visitas')
        .send({
          visitorName: 'Luis Pérez',
          documentType: 'DUI',
          documentNumber: '09876543-2',
          visitDate: TODAY,
          expectedTime: '18:00',
          reason: 'Cena familiar',
        })
        .expect(201);
      requestId = await request('Pedro Gómez', '11111111-1');

      const { data } = await mine(residente1);
      expect(data.map((visit) => visit.status)).toEqual([
        'PENDIENTE_AUTORIZACION',
        'AUTORIZADA',
      ]);
      expect(data[0]).toMatchObject({
        id: requestId,
        createdBy: 'Seguridad',
        code: null,
      });
      expect(new Date(data[0].expiresAt ?? '').getTime()).toBe(
        TEN_AM.getTime() + 15 * MIN,
      );
    });

    it('dos residentes responden a la vez: solo se aplica la primera', async () => {
      const results = await Promise.all([
        respond(residente1, requestId, 'APROBAR'),
        respond(residente2, requestId, 'RECHAZAR', 'No lo conozco'),
      ]);
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
      const rejected = results.find((result) => result.status === 409);
      expect(rejected?.body.message).toBe(
        'Otro residente ya respondió esta solicitud.',
      );
    });

    it('seguridad recibe el aviso de la respuesta que ganó', async () => {
      const saved = await db(app).visit.findUniqueOrThrow({
        where: { id: requestId },
      });
      // Con la hora fija, todos los avisos comparten createdAt: se busca por título.
      const notification = (await inbox(app, seguridad)).find((item) =>
        item.title.startsWith('Solicitud'),
      )!;
      if (saved.status === 'AUTORIZADA') {
        expect(notification.title).toBe('Solicitud aprobada: A-101');
        expect(notification.message).toMatch(
          /aprobó el ingreso de Pedro Gómez\. Ya puedes registrar su entrada\.$/,
        );
      } else {
        expect(notification.title).toBe('Solicitud rechazada: A-101');
        expect(notification.message).toMatch(/Motivo: No lo conozco\.$/);
      }
      expect(notification).toMatchObject({
        sourceModule: 'VISITAS',
        referenceId: requestId,
      });
    });

    it('aprobada, portería registra la entrada y pasa al historial', async () => {
      const approvedId = await request('Marta Ruiz', '22222222-2');
      await respond(residente1, approvedId, 'APROBAR').expect(200);

      const list = await api(app, seguridad)
        .get('seguridad/visitas/solicitudes')
        .expect(200);
      expect(
        list.body.data.find((item: { id: string }) => item.id === approvedId),
      ).toMatchObject({ status: 'AUTORIZADA' });

      await api(app, seguridad)
        .post(`seguridad/visitas/${approvedId}/entrada`)
        .expect(200);
      const history = await mine(residente2, 'historial');
      expect(
        history.data.find((visit) => visit.id === approvedId),
      ).toMatchObject({
        status: 'DENTRO',
        entryAt: TEN_AM.toISOString(),
      });
    });

    it('rechazada con motivo, portería ve el motivo', async () => {
      const rejectedId = await request('Juan Soto', '33333333-3');
      await respond(
        residente1,
        rejectedId,
        'RECHAZAR',
        'No esperamos a nadie',
      ).expect(200);

      const list = await api(app, seguridad)
        .get('seguridad/visitas/solicitudes')
        .expect(200);
      expect(
        list.body.data.find((item: { id: string }) => item.id === rejectedId),
      ).toMatchObject({
        status: 'RECHAZADA',
        rejectReason: 'No esperamos a nadie',
      });
      await api(app, seguridad)
        .post(`seguridad/visitas/${rejectedId}/entrada`)
        .expect(409);
    });

    it('otra unidad no puede responder (404)', async () => {
      const otherId = await request('Elena Díaz', '44444444-4');
      await respond(residente3, otherId, 'APROBAR').expect(404);
    });
  });

  describe('vencimiento a los 15 minutos', () => {
    let lateId: string;

    beforeAll(async () => {
      lateId = await request('Tarde Ruiz', '55555555-5');
      vi.setSystemTime(new Date(TEN_AM.getTime() + 16 * MIN));
    });

    afterAll(() => {
      vi.setSystemTime(TEN_AM);
    });

    it('pasados los 15 minutos ya no se puede responder', async () => {
      const { body } = await respond(residente1, lateId, 'APROBAR').expect(409);
      expect(body.message).toBe(
        'La solicitud venció: pasaron más de 15 minutos sin respuesta.',
      );
    });

    it('la tarea la pasa a Rechazada con "Sin respuesta del residente"', async () => {
      const expired = await app.get(VisitsCronService).expireRequests();
      expect(expired).toBeGreaterThanOrEqual(1);

      const list = await api(app, seguridad)
        .get('seguridad/visitas/solicitudes')
        .expect(200);
      expect(
        list.body.data.find((item: { id: string }) => item.id === lateId),
      ).toMatchObject({
        status: 'RECHAZADA',
        rejectReason: 'Sin respuesta del residente',
      });

      const { body } = await respond(residente1, lateId, 'APROBAR').expect(409);
      expect(body.message).toBe(
        'La solicitud venció: pasaron más de 15 minutos sin respuesta.',
      );
      const history = await mine(residente1, 'historial');
      expect(history.data.find((visit) => visit.id === lateId)).toMatchObject({
        status: 'RECHAZADA',
        rejectReason: 'Sin respuesta del residente',
      });
    });
  });
});
