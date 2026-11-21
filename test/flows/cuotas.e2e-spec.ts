import type { INestApplication } from '@nestjs/common';
import { addMonths } from '../../src/fees/billing-period/index.js';
import { addDays, todayIso } from '../../src/common/time/index.js';
import { api, createTestApp, db, login, resetData } from '../support/app.js';

/** Flujo H39 → H3 → H32: las cuotas del seed, la generación y la morosidad. */
describe('Flujo de cuotas y morosidad (H39, H3, H32)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string;

  const today = todayIso();
  const period = today.slice(0, 7);
  const dueDate = today;
  const generate = (change: object = {}) =>
    api(app, admin)
      .post('cuotas/generaciones')
      .send({ period, amount: 45, dueDate, ...change });

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
    ]);
    // El seed marca Moroso según la fecha en que corre: las cuotas del último
    // mes vencen a los 30 días. Se fijan Pendientes para que la prueba dé lo
    // mismo cualquier día del mes.
    await db(app).fee.updateMany({
      where: { period: addMonths(period, -1), status: 'MOROSO' },
      data: { status: 'PENDIENTE', overdueAt: null },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('H39: el seed trae las cuotas de los 2 meses anteriores', async () => {
    const { body } = await api(app, admin)
      .get('cuotas/generaciones')
      .expect(200);
    expect(body.data.map((item: { period: string }) => item.period)).toEqual([
      addMonths(period, -1),
      addMonths(period, -2),
    ]);
    expect(body.data[0].createdCount).toBe(5);
  });

  it('H32: el panel refleja los morosos del seed', async () => {
    const { body } = await api(app, admin)
      .get('admin/reportes/morosidad')
      .expect(200);
    expect(body.summary).toMatchObject({ activeUnits: 5, overdueUnits: 2 });
    expect(body.summary.overduePct).toBe(40);
    expect(
      body.data.map((row: { unitCode: string }) => row.unitCode).sort(),
    ).toEqual(['B-203', 'C-304']);
    // Cada una debe la cuota en mora y la pendiente del mes siguiente.
    expect(body.data[0].owedAmount).toBe(90);
  });

  it('H32: rechaza un rango invertido con el campo', async () => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/morosidad?from=${today}&to=${addDays(today, -1)}`)
      .expect(400);
    expect(body).toMatchObject({ statusCode: 400 });
    expect(body.field).toEqual(expect.any(String));
  });

  it('H3: un residente no genera cuotas (403)', async () => {
    await api(app, residente1)
      .post('cuotas/generaciones')
      .send({ period, amount: 45, dueDate })
      .expect(403);
  });

  it.each<[string, object, string]>([
    ['un periodo pasado', { period: addMonths(period, -1) }, 'period'],
    ['un periodo muy lejano', { period: addMonths(period, 4) }, 'period'],
    ['monto cero', { amount: 0 }, 'amount'],
    ['más de dos decimales', { amount: 10.999 }, 'amount'],
    ['vencimiento fuera del periodo', { dueDate: '2020-01-10' }, 'dueDate'],
  ])('H3: rechaza %s (400)', async (_caso, change, field) => {
    const { body } = await generate(change).expect(400);
    expect(body).toMatchObject({ field });
  });

  it('H3: la vista previa indica cuántas se crearían, sin crear nada', async () => {
    const { body } = await api(app, admin)
      .get(`cuotas/generaciones/vista-previa?period=${period}`)
      .expect(200);
    expect(body).toEqual({ activeUnits: 5, alreadyGenerated: 0, toCreate: 5 });
    await expect(db(app).fee.count({ where: { period } })).resolves.toBe(0);
  });

  it('H3: genera una cuota Pendiente por unidad activa', async () => {
    const { body } = await generate().expect(201);
    expect(body).toMatchObject({
      period,
      amount: 45,
      dueDate,
      createdCount: 5,
      skippedCount: 0,
    });

    const fees = await db(app).fee.findMany({ where: { period } });
    expect(fees).toHaveLength(5);
    expect(new Set(fees.map((fee) => fee.status))).toEqual(
      new Set(['PENDIENTE']),
    );
  });

  it('H3: generar otra vez no duplica nada (409)', async () => {
    const { body } = await generate().expect(409);
    expect(body.message).toMatch(/ya fueron generadas/);
    await expect(db(app).fee.count({ where: { period } })).resolves.toBe(5);
  });

  it('H3: dos generaciones a la vez no duplican cuotas', async () => {
    const next = addMonths(period, 1);
    const results = await Promise.all([
      generate({ period: next, dueDate: `${next}-10` }),
      generate({ period: next, dueDate: `${next}-10` }),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    await expect(db(app).fee.count({ where: { period: next } })).resolves.toBe(
      5,
    );
  });
});
