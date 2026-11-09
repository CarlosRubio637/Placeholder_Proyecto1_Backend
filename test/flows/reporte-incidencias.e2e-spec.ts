import type { INestApplication } from '@nestjs/common';
import {
  addDays,
  condominiumDayStart,
  todayIso,
} from '../../src/common/time/index.js';
import {
  PNG,
  api,
  createTestApp,
  db,
  login,
  resetData,
} from '../support/app.js';

const DAY = 24 * 60 * 60 * 1000;

/** Flujo H10 → H34: las incidencias registradas alimentan el reporte. */
describe('Flujo del reporte de incidencias (H10, H34)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string;

  const today = todayIso();
  const range = `from=${addDays(today, -40)}&to=${today}`;

  /** Registra por la API y ajusta lo que todavía no tiene endpoint (H12, H13). */
  async function incident(title: string, change: object = {}): Promise<string> {
    const { body } = await api(app, residente1)
      .post('incidencias')
      .field('title', title)
      .field('description', 'Descripción de la incidencia de prueba.')
      .field('location', 'LOBBY')
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    await db(app).incident.update({ where: { id: body.id }, data: change });
    return body.number as string;
  }

  type Cell = { status: string; priority: string; count: number };
  const cell = (matrix: Cell[], status: string, priority: string) =>
    matrix.find((item) => item.status === status && item.priority === priority)
      ?.count;

  let staleNumber: string;
  let limitNumber: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
    ]);

    const resolvedAt = new Date();
    await incident('Reciente pendiente alta', { priority: 'ALTA' });
    await incident('Reciente en proceso', {
      status: 'EN_PROCESO',
      priority: 'BAJA',
    });
    await incident('Resuelta en tres días', {
      status: 'RESUELTO',
      priority: 'MEDIA',
      createdAt: new Date(resolvedAt.getTime() - 3 * DAY),
      resolvedAt,
    });
    // Límites de "más de 7 días": el día 8 entra y el día 7 no.
    staleNumber = await incident('Abierta hace 20 días', {
      createdAt: new Date(Date.now() - 20 * DAY),
    });
    limitNumber = await incident('Abierta justo en el día 8', {
      createdAt: new Date(
        condominiumDayStart(addDays(today, -7)).getTime() - 1,
      ),
    });
    await incident('Abierta justo en el día 7', {
      createdAt: condominiumDayStart(addDays(today, -7)),
    });
    await incident('Resuelta antigua no cuenta como abierta', {
      status: 'RESUELTO',
      createdAt: new Date(resolvedAt.getTime() - 30 * DAY),
      resolvedAt: new Date(resolvedAt.getTime() - 29.5 * DAY),
    });
  });

  afterAll(async () => {
    await resetData(app);
    await app.close();
  });

  it('la tabla siempre trae las 9 combinaciones de estado y prioridad', async () => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?${range}`)
      .expect(200);
    expect(body.matrix).toHaveLength(9);
    expect(cell(body.matrix, 'PENDIENTE', 'ALTA')).toBe(1);
    expect(cell(body.matrix, 'EN_PROCESO', 'BAJA')).toBe(1);
    expect(cell(body.matrix, 'EN_PROCESO', 'ALTA')).toBe(0);
  });

  it('el total de abiertas no incluye las resueltas', async () => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?${range}`)
      .expect(200);
    expect(body.openTotal).toBe(5);
  });

  it('promedia el tiempo de resolución en días', async () => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?${range}`)
      .expect(200);
    // 3 días y medio día, promediados.
    expect(body.avgResolutionDays).toBe(1.8);
  });

  it('lista las abiertas con más de 7 días, respetando el límite', async () => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?${range}`)
      .expect(200);
    expect(body.stale.total).toBe(2);
    const numbers = body.stale.data.map(
      (row: { number: string }) => row.number,
    );
    expect(numbers).toEqual(expect.arrayContaining([staleNumber, limitNumber]));
    const limit = body.stale.data.find(
      (row: { number: string }) => row.number === limitNumber,
    );
    expect(limit).toMatchObject({ daysOpen: 8, unitCode: 'A-101' });
  });

  it('el periodo filtra la tabla, pero no las abiertas antiguas', async () => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?from=${addDays(today, -2)}&to=${today}`)
      .expect(200);
    expect(body.openTotal).toBe(2);
    expect(body.stale.total).toBe(2);
  });

  it('sin resoluciones en el periodo, el promedio es null', async () => {
    const start = addDays(today, -20);
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?from=${start}&to=${start}`)
      .expect(200);
    expect(body.avgResolutionDays).toBeNull();
  });

  it('pagina la lista de antiguas', async () => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?${range}&page=2&pageSize=1`)
      .expect(200);
    expect(body.stale).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(body.stale.data).toHaveLength(1);
  });

  it.each([
    ['un rango invertido', `from=${today}&to=${addDays(today, -1)}`, 'to'],
    ['más de 366 días', `from=${addDays(today, -367)}&to=${today}`, 'to'],
    ['una fecha inválida', 'from=ayer', 'from'],
  ])('rechaza %s con el campo (400)', async (_caso, query, field) => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/incidencias?${query}`)
      .expect(400);
    expect(body).toMatchObject({ field });
  });
});
