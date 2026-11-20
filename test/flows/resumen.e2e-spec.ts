import type { INestApplication } from '@nestjs/common';
import { AssembliesCronService } from '../../src/admin/assemblies/assemblies.cron.js';
import {
  PNG,
  api,
  createTestApp,
  db,
  login,
  resetData,
} from '../support/app.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Summary = {
  debt: { owedAmount: number; overduePct: number };
  areas: {
    avgOccupancyPct: number | null;
    mostUsed: { areaId: string; name: string } | null;
  };
  incidents: { openTotal: number; staleCount: number };
  voting: { assemblyTitle: string; avgParticipationPct: number } | null;
  generatedAt: string;
};

/** Flujo H32 a H35 → H37: cada tarjeta coincide con su reporte. */
describe('Flujo del resumen de la administración (H32 a H35, H37)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string;
  let seguridad: string;

  const summary = async () =>
    (await api(app, admin).get('admin/reportes/resumen').expect(200))
      .body as Summary;

  const report = async <T>(path: string) =>
    (await api(app, admin).get(`admin/reportes/${path}`).expect(200)).body as T;

  /** Registra una incidencia por la API y ajusta lo que H12 y H13 cambian. */
  async function incident(title: string, change: object = {}) {
    const { body } = await api(app, residente1)
      .post('incidencias')
      .field('title', title)
      .field('description', 'Descripción de la incidencia de prueba.')
      .field('location', 'LOBBY')
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    await db(app).incident.update({
      where: { id: body.id as string },
      data: change,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, seguridad] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'seguridad1'),
    ]);

    await incident('Abierta hoy');
    await incident('Abierta hace 20 días', {
      createdAt: new Date(Date.now() - 20 * DAY),
    });
    // Abierta hace 400 días: fuera de cualquier periodo, pero sigue abierta.
    await incident('Abierta hace 400 días', {
      status: 'EN_PROCESO',
      createdAt: new Date(Date.now() - 400 * DAY),
    });
    await incident('Resuelta', {
      status: 'RESUELTO',
      resolvedAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC: responde las cuatro tarjetas y la hora de generación', async () => {
    const before = Date.now();
    const body = await summary();
    expect(Object.keys(body).sort()).toEqual([
      'areas',
      'debt',
      'generatedAt',
      'incidents',
      'voting',
    ]);
    expect(new Date(body.generatedAt).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
  });

  it('Morosidad: las mismas cifras que el panel de H32 (últimos 12 meses)', async () => {
    const panel = await report<{
      summary: { owedAmount: number; overduePct: number };
    }>('morosidad');
    expect((await summary()).debt).toEqual({
      owedAmount: panel.summary.owedAmount,
      overduePct: panel.summary.overduePct,
    });
  });

  it('Áreas: promedio simple de la ocupación del mes y la más usada de H33', async () => {
    const areas = await report<{
      data: { occupancyPct: number }[];
      mostUsed: { areaId: string; name: string } | null;
    }>('areas');
    const average =
      Math.round(
        (areas.data.reduce((sum, area) => sum + area.occupancyPct, 0) /
          areas.data.length) *
          10,
      ) / 10;

    expect(areas.data.length).toBeGreaterThan(0);
    expect((await summary()).areas).toEqual({
      avgOccupancyPct: average,
      mostUsed: areas.mostUsed,
    });
  });

  it('Incidencias: todas las abiertas de hoy y las de más de 7 días de H34', async () => {
    const incidents = await report<{ stale: { total: number } }>('incidencias');
    const body = await summary();

    // Abiertas: hoy, hace 20 días y hace 400 días (sin importar el periodo).
    expect(body.incidents.openTotal).toBe(3);
    // Más de 7 días: hace 20 y hace 400, igual que la lista del reporte.
    expect(body.incidents.staleCount).toBe(2);
    expect(body.incidents.staleCount).toBe(incidents.stale.total);
  });

  describe('Votaciones', () => {
    it('sin asambleas cerradas la tarjeta queda en "Sin datos" (null)', async () => {
      expect((await summary()).voting).toBeNull();
    });

    it('toma la última asamblea cerrada con la participación de H35', async () => {
      const runCron = () =>
        app.get(AssembliesCronService).handleAssembliesLifecycle();
      const create = async (title: string) => {
        const { body } = await api(app, admin)
          .post('admin/asambleas')
          .send({
            title,
            startsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
            endsAt: new Date(Date.now() + 50 * HOUR).toISOString(),
            topics: [
              { question: '¿Aprobar el presupuesto?', options: ['Sí', 'No'] },
              { question: '¿Pintar la fachada?', options: ['Sí', 'No'] },
            ],
          })
          .expect(201);
        return body.id as string;
      };
      const openAndClose = async (id: string, closedAt: Date) => {
        await db(app).assembly.update({
          where: { id },
          data: { startsAt: new Date(Date.now() - 1000) },
        });
        await runCron();
        const [topic] = await db(app).assemblyTopic.findMany({
          where: { assemblyId: id },
          orderBy: { order: 'asc' },
          select: { id: true, options: { select: { id: true } } },
        });
        await api(app, residente1)
          .post(`asambleas/temas/${topic.id}/votos`)
          .send({ optionId: topic.options[0].id })
          .expect(201);
        await db(app).assembly.update({
          where: { id },
          data: { endsAt: new Date(Date.now() - 1000) },
        });
        await runCron();
        await db(app).assembly.update({ where: { id }, data: { closedAt } });
      };

      const anterior = await create('Asamblea anterior');
      await openAndClose(anterior, new Date(Date.now() - 10 * DAY));
      const ultima = await create('Asamblea más reciente');
      await openAndClose(ultima, new Date(Date.now() - DAY));
      // Una abierta no cuenta, aunque sea más nueva.
      const abierta = await create('Asamblea abierta');
      await db(app).assembly.update({
        where: { id: abierta },
        data: { startsAt: new Date(Date.now() - 1000) },
      });
      await runCron();

      const participation = await report<{
        data: { title: string; avgParticipationPct: number }[];
      }>(`participacion?assemblyId=${ultima}`);

      expect((await summary()).voting).toEqual({
        assemblyTitle: 'Asamblea más reciente',
        avgParticipationPct: participation.data[0].avgParticipationPct,
      });
      expect(participation.data[0].avgParticipationPct).toBeGreaterThan(0);
    });
  });

  it('403 para Residente y Seguridad', async () => {
    for (const token of [residente1, seguridad]) {
      await api(app, token).get('admin/reportes/resumen').expect(403);
    }
  });
});
