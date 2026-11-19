import type { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '../../src/common/time/index.js';
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
/** Las solicitudes solo se aceptan de 06:00 a 22:00: el flujo corre a las 10:00. */
const TEN_AM = condominiumInstant(TODAY, '10:00');

/** Flujo H14 → H16 → H30 → H31: la portería registra entradas. */
describe('Flujo de portería: entradas de visitantes (H14, H16, H30, H31)', () => {
  let app: INestApplication;
  let residente1: string; // A-101
  let residente3: string; // A-102
  let residente4: string; // B-101
  let seguridad: string;
  let unitB101: string;

  const preauthorize = (token: string, change: object = {}) =>
    api(app, token)
      .post('visitas')
      .send({
        visitorName: 'Rosa Martínez',
        documentType: 'DUI',
        documentNumber: '01234567-8',
        visitDate: TODAY,
        expectedTime: '15:30',
        reason: 'Visita familiar',
        ...change,
      })
      .expect(201);

  const search = (q: string) =>
    api(app, seguridad).get(
      `seguridad/visitas/buscar?q=${encodeURIComponent(q)}`,
    );

  const enter = (id: string) =>
    api(app, seguridad).post(`seguridad/visitas/${id}/entrada`);

  const request = (change: object = {}) =>
    api(app, seguridad)
      .post('seguridad/visitas/solicitudes')
      .send({
        visitorName: 'Pedro Gómez',
        documentType: 'PASAPORTE',
        documentNumber: 'b7654321',
        reason: 'Entrega de muebles',
        unitId: unitB101,
        ...change,
      });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: TEN_AM });
    app = await createTestApp();
    await resetData(app);
    [residente1, residente3, residente4, seguridad] = await Promise.all([
      login(app, 'residente1'),
      login(app, 'residente3'),
      login(app, 'residente4'),
      login(app, 'seguridad1'),
    ]);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  describe('unidades para el formulario', () => {
    it('cada unidad trae cuántos residentes activos tiene, y sigue siendo lista', async () => {
      const tower = await db(app).tower.findUniqueOrThrow({
        where: { letter: 'B' },
      });
      const { body } = await api(app, seguridad)
        .get(`unidades?towerId=${tower.id}`)
        .expect(200);

      expect(Array.isArray(body)).toBe(true);
      const b101 = body.find((unit: { code: string }) => unit.code === 'B-101');
      const b102 = body.find((unit: { code: string }) => unit.code === 'B-102');
      expect(b101.residentCount).toBe(1);
      expect(b102.residentCount).toBe(0);
      unitB101 = b101.id;
    });
  });

  describe('visita preautorizada (H14 → H16)', () => {
    let visitId: string;
    let code: string;

    it('Seguridad la encuentra por código, sin importar mayúsculas', async () => {
      const created = await preauthorize(residente1);
      visitId = created.body.id;
      code = created.body.code;

      const { body } = await search(code.toLowerCase()).expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: visitId,
        visitorName: 'Rosa Martínez',
        documentNumber: '01234567-8',
        unitCode: 'A-101',
        status: 'AUTORIZADA',
        visitDate: TODAY,
      });
    });

    it('también por número de documento', async () => {
      const { body } = await search('01234567-8').expect(200);
      expect(body.data.map((visit: { id: string }) => visit.id)).toEqual([
        visitId,
      ]);
    });

    it('sin coincidencias responde una lista vacía; una búsqueda mal formada, 400', async () => {
      await expect(search('ZZZZZZ').expect(200)).resolves.toMatchObject({
        body: { data: [] },
      });
      const { body } = await search('ab').expect(400);
      expect(body).toMatchObject({ field: 'q' });
    });

    it('registra la entrada con la hora del servidor', async () => {
      const { body } = await enter(visitId).expect(200);
      expect(body).toEqual({
        id: visitId,
        status: 'DENTRO',
        entryAt: TEN_AM.toISOString(),
      });

      const saved = await db(app).visit.findUniqueOrThrow({
        where: { id: visitId },
        include: { entryBy: true },
      });
      expect(saved.entryBy?.email).toBe('seguridad1@condominio.test');
    });

    it('registrarla otra vez responde 409 con el estado actual', async () => {
      const { body } = await enter(visitId).expect(409);
      expect(body).toMatchObject({
        status: 'DENTRO',
        message: 'No se puede registrar la entrada: la visita está Dentro.',
      });
    });

    it('el mismo visitante no puede entrar con otra autorización', async () => {
      const other = await preauthorize(residente3, {
        reason: 'Reunión de trabajo',
      });
      const { body } = await enter(other.body.id).expect(409);
      expect(body.message).toBe(
        'Este visitante ya está dentro. Registra su salida primero.',
      );
    });

    it('una autorización de otro día no sirve hoy', async () => {
      const tomorrow = await preauthorize(residente1, {
        visitorName: 'Luis Pérez',
        documentNumber: '09876543-2',
        visitDate: addDays(TODAY, 1),
      });
      // No aparece en la búsqueda de hoy...
      await expect(search('09876543-2').expect(200)).resolves.toMatchObject({
        body: { data: [] },
      });
      // ...y por id responde 409.
      const { body } = await enter(tomorrow.body.id).expect(409);
      expect(body.message).toBe(
        'La autorización no es válida en este horario.',
      );
    });

    it('una visita inexistente responde 404', async () => {
      await enter('3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11').expect(404);
    });
  });

  describe('visitante sin autorización (H16 → H30 → H31)', () => {
    let requestId: string;

    it('404 si la unidad no existe', async () => {
      await request({ unitId: '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11' }).expect(
        404,
      );
    });

    it('409 si la unidad no tiene residentes', async () => {
      const empty = await db(app).unit.findUniqueOrThrow({
        where: { code: 'B-102' },
      });
      const { body } = await request({ unitId: empty.id }).expect(409);
      expect(body.message).toBe('La unidad no tiene residentes registrados.');
    });

    it('valida los datos igual que H14', async () => {
      const { body } = await request({ documentNumber: 'A1' }).expect(400);
      expect(body).toMatchObject({
        field: 'documentNumber',
        message: ['El pasaporte debe tener de 6 a 12 letras o números.'],
      });
    });

    it('crea la solicitud Pendiente con 15 minutos para responder', async () => {
      const { body } = await request().expect(201);
      expect(body).toMatchObject({
        status: 'PENDIENTE_AUTORIZACION',
        unitCode: 'B-101',
      });
      const createdAt = await db(app).visit.findUniqueOrThrow({
        where: { id: body.id },
      });
      expect(new Date(body.expiresAt).getTime()).toBe(
        createdAt.createdAt.getTime() + 15 * 60 * 1000,
      );
      requestId = body.id;
    });

    it('avisa solo a los residentes de la unidad destino', async () => {
      const [notification] = await inbox(app, residente4);
      expect(notification).toMatchObject({
        title: 'Visitante en portería',
        message:
          'Pedro Gómez (Pasaporte B7654321) quiere visitar tu unidad. Motivo: Entrega de muebles. Responde en 15 minutos.',
        sourceModule: 'VISITAS',
        referenceId: requestId,
      });
      // residente3 solo tiene sus propias visitas de H14, que no avisan a residentes.
      await expect(inbox(app, residente3)).resolves.toEqual([]);
    });

    it('aparece en "Esperando respuesta" con su vencimiento', async () => {
      const { body } = await api(app, seguridad)
        .get('seguridad/visitas/solicitudes')
        .expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: requestId,
        status: 'PENDIENTE_AUTORIZACION',
        origin: 'SIN_AUTORIZACION_PREVIA',
        code: null,
        unitCode: 'B-101',
        rejectReason: null,
      });
      expect(body.data[0].expiresAt).toEqual(expect.any(String));
    });

    it('no se puede registrar la entrada mientras está Pendiente', async () => {
      const { body } = await enter(requestId).expect(409);
      expect(body.status).toBe('PENDIENTE_AUTORIZACION');
    });

    it('cuando el residente aprueba (H15), entra', async () => {
      // H15 todavía no tiene endpoint: se aplica su efecto directo en la base.
      await db(app).visit.update({
        where: { id: requestId },
        data: { status: 'AUTORIZADA', respondedAt: new Date() },
      });
      await enter(requestId).expect(200);

      const { body } = await api(app, seguridad)
        .get('seguridad/visitas/solicitudes')
        .expect(200);
      const row = body.data.find(
        (item: { id: string }) => item.id === requestId,
      );
      expect(row).toMatchObject({ status: 'DENTRO', expiresAt: null });
    });

    it('un visitante que ya está dentro no genera otra solicitud', async () => {
      const { body } = await request({ documentNumber: 'B7654321' }).expect(
        409,
      );
      expect(body.message).toBe(
        'Este visitante ya está dentro. Registra su salida primero.',
      );
    });

    it('una rechazada muestra su motivo', async () => {
      const { body } = await request({
        visitorName: 'Marta Ruiz',
        documentType: 'DUI',
        documentNumber: '11111111-1',
      }).expect(201);
      await db(app).visit.update({
        where: { id: body.id },
        data: {
          status: 'RECHAZADA',
          rejectReason: 'Sin respuesta del residente',
        },
      });

      const list = await api(app, seguridad)
        .get('seguridad/visitas/solicitudes')
        .expect(200);
      // Con la hora fija, varias solicitudes comparten createdAt: se busca por id.
      const row = list.body.data.find(
        (item: { id: string }) => item.id === body.id,
      );
      expect(row).toMatchObject({
        id: body.id,
        status: 'RECHAZADA',
        rejectReason: 'Sin respuesta del residente',
        expiresAt: null,
      });
      const entry = await enter(body.id).expect(409);
      expect(entry.body.status).toBe('RECHAZADA');
    });
  });

  describe('concurrencia', () => {
    it('dos entradas del mismo visitante a la vez: solo una pasa', async () => {
      const visitor = {
        visitorName: 'Ana Torres',
        documentNumber: '22222222-2',
      };
      const [one, two] = await Promise.all([
        preauthorize(residente1, visitor),
        preauthorize(residente3, visitor),
      ]);

      const results = await Promise.all([
        enter(one.body.id),
        enter(two.body.id),
      ]);

      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
      await expect(
        db(app).visit.count({
          where: { documentNumber: '22222222-2', status: 'DENTRO' },
        }),
      ).resolves.toBe(1);
    });

    it('la misma visita dos veces a la vez: una sola entrada', async () => {
      const visit = await preauthorize(residente1, {
        visitorName: 'Jorge Díaz',
        documentNumber: '33333333-3',
      });
      const results = await Promise.all([
        enter(visit.body.id),
        enter(visit.body.id),
      ]);
      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
    });
  });

  describe('horario', () => {
    it('después de las 22:00 no se pueden enviar solicitudes', async () => {
      vi.setSystemTime(condominiumInstant(TODAY, '22:30'));
      try {
        // El token de las 10:00 ya venció a esta hora.
        seguridad = await login(app, 'seguridad1');
        const { body } = await request({
          visitorName: 'Nadie Tarde',
          documentType: 'DUI',
          documentNumber: '44444444-4',
        }).expect(409);
        expect(body.message).toBe('Fuera del horario de visitas.');
      } finally {
        vi.setSystemTime(TEN_AM);
      }
    });
  });
});
