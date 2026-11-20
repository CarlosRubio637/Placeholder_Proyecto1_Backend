import type { INestApplication } from '@nestjs/common';
import { todayIso } from '../../src/common/time/index.js';
import { condominiumInstant } from '../../src/visits/visits.utils.js';
import { api, createTestApp, db, login, resetData } from '../support/app.js';

const TODAY = todayIso();
const TEN_AM = condominiumInstant(TODAY, '10:00');
// Unos minutos después de la entrada, dentro de la vigencia del token de las 10:00.
const EXIT_TIME = condominiumInstant(TODAY, '10:03');
const MISSING_ID = '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11';
const NOT_INSIDE = 'Este visitante no tiene una entrada activa.';

/** Flujo H14 → H16 → H17: un visitante entra y sale del condominio. */
describe('Flujo de portería: salidas de visitantes (H14, H16, H17)', () => {
  let app: INestApplication;
  let residente1: string; // A-101
  let seguridad: string;
  let seguridad2: string;

  const preauthorize = (change: object = {}) =>
    api(app, residente1)
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

  const enter = (id: string) =>
    api(app, seguridad).post(`seguridad/visitas/${id}/entrada`);

  const exit = (id: string, token = seguridad) =>
    api(app, token).post(`seguridad/visitas/${id}/salida`);

  /** Crea una visita autorizada y registra su entrada. */
  const inside = async (change: object = {}) => {
    const { body } = await preauthorize(change);
    await enter(body.id).expect(200);
    return body.id as string;
  };

  beforeAll(async () => {
    // Las autorizaciones valen de 06:00 a 22:00: el flujo corre a las 10:00.
    vi.useFakeTimers({ toFake: ['Date'], now: TEN_AM });
    app = await createTestApp();
    await resetData(app);
    [residente1, seguridad, seguridad2] = await Promise.all([
      login(app, 'residente1'),
      login(app, 'seguridad1'),
      login(app, 'seguridad2'),
    ]);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  describe('salida de un visitante dentro', () => {
    let visitId: string;

    beforeAll(async () => {
      visitId = await inside();
    });

    it('una visita inexistente responde 404', async () => {
      const { body } = await exit(MISSING_ID).expect(404);
      expect(body.message).toBe('La visita no existe.');
    });

    it('registra la salida con la hora del servidor y el agente', async () => {
      vi.setSystemTime(EXIT_TIME);
      try {
        const { body } = await exit(visitId).expect(200);
        expect(body).toEqual({
          id: visitId,
          status: 'FINALIZADA',
          entryAt: TEN_AM.toISOString(),
          exitAt: EXIT_TIME.toISOString(),
        });
      } finally {
        vi.setSystemTime(TEN_AM);
      }

      const saved = await db(app).visit.findUniqueOrThrow({
        where: { id: visitId },
        include: { exitBy: true },
      });
      expect(saved.status).toBe('FINALIZADA');
      expect(saved.exitAt).toEqual(EXIT_TIME);
      expect(saved.exitBy?.email).toBe('seguridad1@condominio.test');
    });

    it('registrarla otra vez responde 409 sin cambiar nada', async () => {
      const before = await db(app).visit.findUniqueOrThrow({
        where: { id: visitId },
      });

      const { body } = await exit(visitId).expect(409);
      expect(body.message).toBe(NOT_INSIDE);

      await expect(
        db(app).visit.findUniqueOrThrow({ where: { id: visitId } }),
      ).resolves.toEqual(before);
    });

    it('la búsqueda de portería la muestra Finalizada', async () => {
      const { body } = await api(app, seguridad)
        .get('seguridad/visitas/buscar?q=01234567-8')
        .expect(200);
      expect(body.data[0]).toMatchObject({ id: visitId, status: 'FINALIZADA' });
    });

    it('ya fuera, el mismo visitante puede volver a entrar con otra autorización', async () => {
      const again = await preauthorize({ reason: 'Segunda visita' });
      await enter(again.body.id).expect(200);
    });
  });

  it('una visita que no ha entrado responde 409', async () => {
    const { body } = await preauthorize({
      visitorName: 'Luis Pérez',
      documentNumber: '09876543-2',
    });
    const response = await exit(body.id).expect(409);
    expect(response.body.message).toBe(NOT_INSIDE);

    const saved = await db(app).visit.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(saved).toMatchObject({
      status: 'AUTORIZADA',
      exitAt: null,
      exitById: null,
    });
  });

  it('dos agentes registran la misma salida a la vez: solo se aplica una', async () => {
    const visitId = await inside({
      visitorName: 'Ana Torres',
      documentNumber: '22222222-2',
    });

    const results = await Promise.all([
      exit(visitId, seguridad),
      exit(visitId, seguridad2),
    ]);

    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([200, 409]);
    const rejected = results.find((result) => result.status === 409);
    expect(rejected?.body.message).toBe(NOT_INSIDE);

    const winner = results.find((result) => result.status === 200);
    const saved = await db(app).visit.findUniqueOrThrow({
      where: { id: visitId },
    });
    expect(saved.status).toBe('FINALIZADA');
    expect(saved.exitAt?.toISOString()).toBe(winner?.body.exitAt);
  });
});
