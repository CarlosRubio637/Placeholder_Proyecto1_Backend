import type { INestApplication } from '@nestjs/common';
import { AssembliesCronService } from '../../src/admin/assemblies/assemblies.cron.js';
import {
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

const HOUR = 60 * 60 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

/**
 * Flujo H22 → tarea programada → H30 → H31 → H23 → H24: de la convocatoria
 * al resultado.
 */
describe('Flujo de asambleas y votación (H22, H30, H31, H23, H24)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string; // A-101
  let residente2: string; // A-101
  let residente3: string; // A-102
  let seguridad: string;
  let assemblyId: string;

  const input = (change: object = {}) => ({
    title: 'Asamblea ordinaria',
    startsAt: iso(2 * HOUR),
    endsAt: iso(50 * HOUR),
    topics: [
      {
        question: '¿Aprobar el presupuesto?',
        options: ['A favor', 'En contra'],
      },
      { question: '¿Pintar la fachada?', options: ['Sí', 'No'] },
    ],
    ...change,
  });

  const runCron = () =>
    app.get(AssembliesCronService).handleAssembliesLifecycle();

  const detail = async (token: string) => {
    const { body } = await api(app, token)
      .get(`asambleas/${assemblyId}`)
      .expect(200);
    return body as {
      status: string;
      topics: {
        id: string;
        options: { id: string }[];
        myUnitVote: { votedAt: string; byMe: boolean } | null;
      }[];
    };
  };

  const vote = (token: string, topicId: string, optionId: string) =>
    api(app, token).post(`asambleas/temas/${topicId}/votos`).send({ optionId });

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('H22: convocatoria', () => {
    it.each<[string, object, string]>([
      ['un inicio cercano', { startsAt: iso(HOUR / 2) }, 'startsAt'],
      ['un cierre demasiado lejano', { endsAt: iso(500 * HOUR) }, 'endsAt'],
      [
        'opciones repetidas',
        { topics: [{ question: '¿Aprobar algo?', options: ['Sí', ' sí '] }] },
        'topics.0.options',
      ],
    ])('rechaza %s con 400 y el campo', async (_caso, change, field) => {
      const { body } = await api(app, admin)
        .post('admin/asambleas')
        .send(input(change))
        .expect(400);
      expect(body).toMatchObject({ statusCode: 400, field });
      expect(body.message).toEqual([expect.any(String)]);
    });

    it('responde en español aunque la regla sea del DTO', async () => {
      const { body } = await api(app, admin)
        .post('admin/asambleas')
        .send(
          input({
            topics: [{ question: '¿Aprobar algo?', options: ['Sí'] }],
          }),
        )
        .expect(400);
      expect(body.message).toEqual([
        'Cada tema necesita entre 2 y 6 opciones distintas.',
      ]);
    });

    it('crea la asamblea Programada', async () => {
      const { body } = await api(app, admin)
        .post('admin/asambleas')
        .send(input())
        .expect(201);
      expect(body).toMatchObject({
        status: 'PROGRAMADA',
        eligibleUnits: null,
      });
      assemblyId = body.id;
    });

    it('se edita mientras está Programada, reemplazando los temas', async () => {
      const { body } = await api(app, admin)
        .put(`admin/asambleas/${assemblyId}`)
        .send(input({ title: 'Asamblea extraordinaria' }))
        .expect(200);
      expect(body).toMatchObject({ title: 'Asamblea extraordinaria' });
      expect(body.topics).toHaveLength(2);
    });

    it('una Programada todavía no aparece a los residentes ni avisa', async () => {
      const { body } = await api(app, residente1)
        .get('asambleas/activas')
        .expect(200);
      expect(body).toEqual({ data: [] });
      await expect(inbox(app, residente1)).resolves.toEqual([]);
    });

    it('una Programada se puede eliminar', async () => {
      const { body } = await api(app, admin)
        .post('admin/asambleas')
        .send(input({ title: 'Para eliminar' }))
        .expect(201);
      await api(app, admin).delete(`admin/asambleas/${body.id}`).expect(204);
      await api(app, admin).get(`admin/asambleas/${body.id}`).expect(404);
    });
  });

  describe('Tarea programada: apertura', () => {
    beforeAll(async () => {
      // La API exige inicio futuro: se adelanta el reloj de esta asamblea.
      await db(app).assembly.update({
        where: { id: assemblyId },
        data: { startsAt: new Date(Date.now() - 1000) },
      });
      await runCron();
    });

    it('la abre y fija las unidades con residentes activos', async () => {
      const { body } = await api(app, admin)
        .get(`admin/asambleas/${assemblyId}`)
        .expect(200);
      expect(body).toMatchObject({ status: 'ABIERTA', eligibleUnits: 5 });
    });

    it('avisa a los residentes y no a Seguridad', async () => {
      const notifications = await inbox(app, residente1);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        title: 'Asamblea abierta: Asamblea extraordinaria',
        sourceModule: 'VOTACIONES',
        referenceId: assemblyId,
      });
      await expect(inbox(app, seguridad)).resolves.toEqual([]);
    });

    it('correrla otra vez no repite el aviso', async () => {
      await runCron();
      await expect(inbox(app, residente1)).resolves.toHaveLength(1);
    });

    it('ya abierta no se puede editar ni eliminar (409)', async () => {
      await api(app, admin)
        .put(`admin/asambleas/${assemblyId}`)
        .send(input())
        .expect(409);
      await api(app, admin).delete(`admin/asambleas/${assemblyId}`).expect(409);
    });
  });

  describe('H23: votación', () => {
    it('la asamblea aparece con el progreso en cero', async () => {
      const { body } = await api(app, residente1)
        .get('asambleas/activas')
        .expect(200);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        id: assemblyId,
        topicCount: 2,
        votedTopics: 0,
      });
    });

    it('rechaza una opción de otro tema (400)', async () => {
      const { topics } = await detail(residente1);
      const { body } = await vote(
        residente1,
        topics[0].id,
        topics[1].options[0].id,
      ).expect(400);
      expect(body).toMatchObject({ field: 'optionId' });
    });

    it('Administración y Seguridad no votan (403)', async () => {
      const { topics } = await detail(residente1);
      for (const token of [admin, seguridad]) {
        await vote(token, topics[0].id, topics[0].options[0].id).expect(403);
      }
    });

    it('dos residentes de la unidad a la vez: cuenta solo el primero', async () => {
      const { topics } = await detail(residente1);
      const [topic] = topics;

      const results = await Promise.all([
        vote(residente1, topic.id, topic.options[0].id),
        vote(residente2, topic.id, topic.options[1].id),
      ]);

      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([201, 409]);
      const created = results.find((result) => result.status === 201);
      expect(created?.body).not.toHaveProperty('optionId');
      const rejected = results.find((result) => result.status === 409);
      expect(rejected?.body.message).toBe('Tu unidad ya votó este tema.');

      await expect(
        db(app).ballot.count({ where: { topicId: topic.id } }),
      ).resolves.toBe(1);
    });

    it('la unidad ve que votó, sin saber qué opción se eligió', async () => {
      const [one, two] = await Promise.all([
        detail(residente1),
        detail(residente2),
      ]);
      const votes = [one.topics[0].myUnitVote, two.topics[0].myUnitVote];
      expect(votes.filter((item) => item?.byMe)).toHaveLength(1);
      expect(votes.every((item) => item !== null)).toBe(true);
      expect(Object.keys(votes[0] ?? {}).sort()).toEqual(['byMe', 'votedAt']);
      expect(one.topics[1].myUnitVote).toBeNull();
    });

    it('otra unidad vota el mismo tema y su progreso es independiente', async () => {
      const { topics } = await detail(residente3);
      expect(topics[0].myUnitVote).toBeNull();
      await vote(residente3, topics[0].id, topics[0].options[0].id).expect(201);

      const { body } = await api(app, residente3)
        .get('asambleas/activas')
        .expect(200);
      expect(body.data[0].votedTopics).toBe(1);
    });

    it('la administración ve cuántas unidades votaron', async () => {
      const { body } = await api(app, admin)
        .get('admin/asambleas?status=ABIERTA')
        .expect(200);
      expect(body.data[0]).toMatchObject({ id: assemblyId, votedUnits: 2 });
    });

    it('una unidad no habilitada no ve ni vota', async () => {
      const unit = await db(app).unit.findUniqueOrThrow({
        where: { code: 'A-102' },
      });
      await db(app).assemblyEligibleUnit.delete({
        where: {
          assemblyId_unitId: { assemblyId, unitId: unit.id },
        },
      });

      await api(app, residente3).get(`asambleas/${assemblyId}`).expect(404);

      const { topics } = await detail(residente1);
      const { body } = await vote(
        residente3,
        topics[1].id,
        topics[1].options[0].id,
      ).expect(403);
      expect(body.message).toBe(
        'Tu unidad no está habilitada para esta asamblea.',
      );
    });
  });

  describe('H24: resultado con la asamblea Abierta', () => {
    it('solo muestra la participación, sin conteos, también al Administrador', async () => {
      for (const token of [admin, residente1]) {
        const { body } = await api(app, token)
          .get(`asambleas/${assemblyId}/resultado`)
          .expect(200);
        expect(body).toMatchObject({ status: 'ABIERTA', closedAt: null });
        expect(body.topics[0]).toMatchObject({ votedUnits: 2 });
        expect(body.topics[1]).toMatchObject({ votedUnits: 0 });
        for (const topic of body.topics) {
          expect(topic).toMatchObject({
            totalVotes: null,
            winnerOptionId: null,
            isTie: false,
          });
          for (const option of topic.options) {
            expect(option.votes).toBeNull();
            expect(option.pct).toBeNull();
          }
        }
      }
    });

    it('Seguridad no ve el resultado (403)', async () => {
      await api(app, seguridad)
        .get(`asambleas/${assemblyId}/resultado`)
        .expect(403);
    });
  });

  describe('Tarea programada: cierre', () => {
    beforeAll(async () => {
      await db(app).assembly.update({
        where: { id: assemblyId },
        data: { endsAt: new Date(Date.now() - 1000) },
      });
    });

    it('pasada la hora de cierre ya no se vota, aunque la tarea no haya corrido (409)', async () => {
      const { topics, status } = await detail(residente1);
      expect(status).toBe('ABIERTA');

      const { body } = await vote(
        residente1,
        topics[1].id,
        topics[1].options[0].id,
      ).expect(409);
      expect(body.message).toBe('La votación no está abierta.');
      await expect(
        db(app).ballot.count({ where: { topicId: topics[1].id } }),
      ).resolves.toBe(0);
    });

    it('la cierra y ya no se puede votar (409)', async () => {
      await runCron();

      const { topics, status } = await detail(residente1);
      expect(status).toBe('CERRADA');

      const { body } = await vote(
        residente1,
        topics[1].id,
        topics[1].options[0].id,
      ).expect(409);
      expect(body.message).toBe('La votación no está abierta.');
    });

    it('sale de las asambleas activas', async () => {
      const { body } = await api(app, residente1)
        .get('asambleas/activas')
        .expect(200);
      expect(body).toEqual({ data: [] });
    });
  });

  describe('H24: resultado al cierre', () => {
    type OptionCount = { optionId: string; votes: number };
    type TopicBody = {
      id: string;
      eligibleUnits: number;
      votedUnits: number;
      totalVotes: number;
      options: { id: string; votes: number; pct: number }[];
      winnerOptionId: string | null;
      isTie: boolean;
    };

    const result = async (token: string) => {
      const { body } = await api(app, token)
        .get(`asambleas/${assemblyId}/resultado`)
        .expect(200);
      return body as { status: string; closedAt: string; topics: TopicBody[] };
    };

    it('guarda el resultado de cada tema al cerrar, a la hora del cierre', async () => {
      const { closedAt } = await result(admin);
      const stored = await db(app).topicResult.findMany({
        where: { topic: { assemblyId } },
      });
      expect(stored).toHaveLength(2);
      for (const row of stored) {
        expect(row.computedAt.toISOString()).toBe(closedAt);
      }
    });

    it('la API devuelve exactamente lo guardado en topic_results', async () => {
      const body = await result(admin);
      expect(body.status).toBe('CERRADA');

      const stored = await db(app).topicResult.findMany({
        where: { topic: { assemblyId } },
      });
      for (const topic of body.topics) {
        const row = stored.find((item) => item.topicId === topic.id);
        expect(row).toBeDefined();
        expect(topic).toMatchObject({
          eligibleUnits: row?.eligibleUnits,
          votedUnits: row?.votedUnits,
          totalVotes: row?.totalVotes,
          winnerOptionId: row?.winnerOptionId,
        });
        expect(
          topic.options.map((option) => ({
            optionId: option.id,
            votes: option.votes,
          })),
        ).toEqual(row?.optionCounts as OptionCount[]);
      }

      // Tema 1: votaron A-101 (un solo voto de la unidad) y A-102. Tema 2: nadie.
      expect(body.topics[0]).toMatchObject({ votedUnits: 2, totalVotes: 2 });
      expect(body.topics[1]).toMatchObject({
        votedUnits: 0,
        totalVotes: 0,
        winnerOptionId: null,
        isTie: false,
      });
    });

    it('el Residente ve el mismo resultado que el Administrador', async () => {
      await expect(result(residente1)).resolves.toEqual(await result(admin));
    });

    it('correr otra vez la tarea no cambia el resultado guardado', async () => {
      const before = await db(app).topicResult.findMany({
        where: { topic: { assemblyId } },
        orderBy: { topicId: 'asc' },
      });
      await runCron();
      const after = await db(app).topicResult.findMany({
        where: { topic: { assemblyId } },
        orderBy: { topicId: 'asc' },
      });
      expect(after).toEqual(before);
    });

    it('el registro de participación muestra unidad y hora, sin la opción', async () => {
      const { topics } = await result(residente1);
      const { body } = await api(app, residente1)
        .get(`asambleas/temas/${topics[0].id}/participacion`)
        .expect(200);
      expect(body).toMatchObject({ total: 2, page: 1, pageSize: 50 });
      expect(
        body.data.map((row: { unitCode: string }) => row.unitCode),
      ).toEqual(['A-101', 'A-102']);
      for (const row of body.data) {
        expect(Object.keys(row).sort()).toEqual(['unitCode', 'votedAt']);
      }
    });

    it('aparece en las asambleas cerradas del residente', async () => {
      const { body } = await api(app, residente1)
        .get('asambleas/cerradas')
        .expect(200);
      expect(body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
      expect(body.data[0]).toMatchObject({ id: assemblyId, topicCount: 2 });
    });
  });
});
