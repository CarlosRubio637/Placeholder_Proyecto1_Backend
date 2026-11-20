import type { INestApplication } from '@nestjs/common';
import { AssembliesCronService } from '../../src/admin/assemblies/assemblies.cron.js';
import { addDays, todayIso } from '../../src/common/time/index.js';
import { api, createTestApp, db, login, resetData } from '../support/app.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

type Topic = {
  question: string;
  votedUnits: number;
  eligibleUnits: number;
  participationPct: number;
};
type Row = {
  assemblyId: string;
  title: string;
  status: string;
  openedAt: string;
  avgParticipationPct: number;
  topics: Topic[];
};
type Report = { data: Row[]; total: number; page: number; pageSize: number };

/** Flujo H22 → H23 → H35: los votos registrados alimentan el reporte. */
describe('Flujo del reporte de participación en votaciones (H22, H23, H35)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string; // A-101
  let residente2: string; // A-101
  let residente3: string; // A-102
  let seguridad: string;

  let cerrada: string; // abierta hace 5 días y ya cerrada
  let abierta: string; // abierta hoy
  let programada: string;
  let antigua: string; // abierta hace 400 días

  const runCron = () =>
    app.get(AssembliesCronService).handleAssembliesLifecycle();

  const create = async (title: string) => {
    const { body } = await api(app, admin)
      .post('admin/asambleas')
      .send({
        title,
        startsAt: iso(2 * HOUR),
        endsAt: iso(50 * HOUR),
        topics: [
          {
            question: '¿Aprobar el presupuesto?',
            options: ['A favor', 'En contra'],
          },
          { question: '¿Pintar la fachada?', options: ['Sí', 'No'] },
        ],
      })
      .expect(201);
    return body.id as string;
  };

  /** Pasa el inicio y deja que la tarea la abra (fija las unidades habilitadas). */
  const open = async (id: string) => {
    await db(app).assembly.update({
      where: { id },
      data: { startsAt: new Date(Date.now() - 1000) },
    });
    await runCron();
  };

  const topicIds = async (id: string) =>
    (
      await db(app).assemblyTopic.findMany({
        where: { assemblyId: id },
        orderBy: { order: 'asc' },
        select: { id: true, options: { select: { id: true } } },
      })
    ).map((topic) => ({ id: topic.id, optionId: topic.options[0].id }));

  const vote = (token: string, topic: { id: string; optionId: string }) =>
    api(app, token)
      .post(`asambleas/temas/${topic.id}/votos`)
      .send({ optionId: topic.optionId })
      .expect(201);

  const report = async (query = '') => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/participacion${query ? `?${query}` : ''}`)
      .expect(200);
    return body as Report;
  };

  let eligible: number;

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, residente2, residente3, seguridad] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'residente2'),
      login(app, 'residente3'),
      login(app, 'seguridad1'),
    ]);

    // Cerrada: A-101 vota los dos temas, A-102 solo el primero.
    cerrada = await create('Asamblea cerrada');
    await open(cerrada);
    const [c1, c2] = await topicIds(cerrada);
    await vote(residente1, c1);
    await vote(residente1, c2);
    await vote(residente3, c1);
    await db(app).assembly.update({
      where: { id: cerrada },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await runCron();
    await db(app).assembly.update({
      where: { id: cerrada },
      data: { openedAt: new Date(Date.now() - 5 * DAY) },
    });

    // Abierta: solo A-101 vota el primer tema (residente2, de la misma unidad).
    abierta = await create('Asamblea abierta');
    await open(abierta);
    const [a1] = await topicIds(abierta);
    await vote(residente2, a1);

    programada = await create('Asamblea programada');

    antigua = await create('Asamblea antigua');
    await open(antigua);
    await db(app).assembly.update({
      where: { id: antigua },
      data: { openedAt: new Date(Date.now() - 400 * DAY) },
    });

    eligible = await db(app).assemblyEligibleUnit.count({
      where: { assemblyId: cerrada },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('por defecto trae las Abiertas y Cerradas de los últimos 12 meses, la más reciente primero', async () => {
    const body = await report();
    expect(body).toMatchObject({ total: 2, page: 1, pageSize: 10 });
    expect(body.data.map((row) => [row.assemblyId, row.status])).toEqual([
      [abierta, 'ABIERTA'],
      [cerrada, 'CERRADA'],
    ]);
  });

  it('calcula la participación con las unidades habilitadas al abrir', async () => {
    expect(eligible).toBeGreaterThan(2);
    const pct = (voted: number) => Math.round((voted / eligible) * 1000) / 10;

    const row = (await report()).data.find((r) => r.assemblyId === cerrada);
    expect(row?.topics).toEqual([
      {
        question: '¿Aprobar el presupuesto?',
        votedUnits: 2,
        eligibleUnits: eligible,
        participationPct: pct(2),
      },
      {
        question: '¿Pintar la fachada?',
        votedUnits: 1,
        eligibleUnits: eligible,
        participationPct: pct(1),
      },
    ]);
    expect(row?.avgParticipationPct).toBe(
      Math.round(((2 + 1) / 2 / eligible) * 100 * 10) / 10,
    );
  });

  it('cuenta la participación de una asamblea todavía Abierta', async () => {
    const row = (await report()).data.find((r) => r.assemblyId === abierta);
    expect(row?.topics.map((t) => t.votedUnits)).toEqual([1, 0]);
  });

  it('no expone qué opción eligió cada unidad', async () => {
    const options = await db(app).topicOption.findMany({
      where: { topic: { assemblyId: { in: [cerrada, abierta] } } },
      select: { id: true, text: true },
    });
    const text = JSON.stringify(await report());
    for (const option of options) {
      expect(text).not.toContain(option.id);
      expect(text).not.toContain(`"${option.text}"`);
    }
  });

  it('con una asamblea trae solo esa, aunque esté fuera del periodo', async () => {
    const body = await report(`assemblyId=${antigua}`);
    expect(body.total).toBe(1);
    expect(body.data[0].assemblyId).toBe(antigua);
  });

  it('una asamblea Programada no tiene datos', async () => {
    const body = await report(`assemblyId=${programada}`);
    expect(body).toMatchObject({ total: 0, data: [] });
  });

  it('el rango de fechas filtra por la apertura', async () => {
    const today = todayIso();
    const body = await report(`from=${addDays(today, -2)}&to=${today}`);
    expect(body.data.map((row) => row.assemblyId)).toEqual([abierta]);
  });

  it('pagina por asamblea', async () => {
    const body = await report('page=2&pageSize=1');
    expect(body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(body.data.map((row) => row.assemblyId)).toEqual([cerrada]);
  });

  it.each([
    ['una asamblea que no es uuid', 'assemblyId=123', 'assemblyId'],
    [
      'un rango invertido',
      `from=${todayIso()}&to=${addDays(todayIso(), -1)}`,
      'to',
    ],
    [
      'más de 366 días',
      `from=${addDays(todayIso(), -367)}&to=${todayIso()}`,
      'to',
    ],
    ['una fecha inválida', 'from=ayer', 'from'],
    ['más de 50 por página', 'pageSize=51', 'pageSize'],
  ])('rechaza %s con el campo (400)', async (_caso, query, field) => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/participacion?${query}`)
      .expect(400);
    expect(body).toMatchObject({ field });
  });

  it('el Residente y Seguridad no pueden verlo (403)', async () => {
    await api(app, residente1).get('admin/reportes/participacion').expect(403);
    await api(app, seguridad).get('admin/reportes/participacion').expect(403);
  });
});
