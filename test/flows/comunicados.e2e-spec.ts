import type { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '../../src/common/time/index.js';
import {
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

/** Flujo H25 → H30 → H31 → H27: comunicado segmentado por torre. */
describe('Flujo de comunicados (H25, H30, H31, H27)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string; // Torre A
  let residente4: string; // Torre B
  let residente5: string; // Torre B
  let seguridad: string;
  let towerB: string;

  const expiresOn = addDays(todayIso(), 10);
  const publish = (change: object) =>
    api(app, admin)
      .post('admin/comunicados')
      .send({
        title: 'Corte de agua en Torre B',
        body: 'El martes no habrá agua de 8:00 a 12:00.',
        category: 'CORTE_SERVICIO',
        audience: 'TORRES',
        towerIds: [towerB],
        expiresOn,
        ...change,
      });

  const vigentes = async (token: string) => {
    const { body } = await api(app, token).get('comunicados').expect(200);
    return body as { total: number; data: { id: string; title: string }[] };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, residente4, residente5, seguridad] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'residente4'),
      login(app, 'residente5'),
      login(app, 'seguridad1'),
    ]);
    const tower = await db(app).tower.findUniqueOrThrow({
      where: { letter: 'B' },
    });
    towerB = tower.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('H25: la vista previa cuenta solo los residentes de la torre', async () => {
    const { body } = await api(app, admin)
      .get(`admin/comunicados/audiencia?towerIds=${towerB}`)
      .expect(200);
    expect(body).toEqual({ recipientCount: 2 });
  });

  it.each<[string, object, string]>([
    ['sin torres', { towerIds: [] }, 'towerIds'],
    ['una vigencia pasada', { expiresOn: todayIso() }, 'expiresOn'],
    ['un título corto', { title: 'Hola' }, 'title'],
  ])('H25: rechaza %s (400)', async (_caso, change, field) => {
    const { body } = await publish(change).expect(400);
    expect(body).toMatchObject({ field });
  });

  let announcementId: string;

  it('H25: publica para la torre', async () => {
    const { body } = await publish({}).expect(201);
    expect(body.recipientCount).toBe(2);
    announcementId = body.id;
  });

  it('H30 y H31: avisa solo a los residentes de esa torre', async () => {
    for (const token of [residente4, residente5]) {
      const notifications = await inbox(app, token);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        title: 'Nuevo comunicado: Corte de agua en Torre B',
        sourceModule: 'COMUNICADOS',
        referenceId: announcementId,
      });
    }
    await expect(inbox(app, residente1)).resolves.toEqual([]);
    await expect(inbox(app, seguridad)).resolves.toEqual([]);
  });

  it('H27: lo ve la torre destinataria y no las demás', async () => {
    await expect(vigentes(residente4)).resolves.toMatchObject({ total: 1 });
    await expect(vigentes(residente1)).resolves.toMatchObject({
      total: 0,
      data: [],
    });
  });

  it('H27: abrirlo guarda la lectura una sola vez', async () => {
    const first = await api(app, residente4)
      .post(`comunicados/${announcementId}/lectura`)
      .expect(200);
    const second = await api(app, residente4)
      .post(`comunicados/${announcementId}/lectura`)
      .expect(200);
    expect(second.body.readAt).toBe(first.body.readAt);
    expect(first.body.readAt).toEqual(expect.any(String));
  });

  it('H27: una torre ajena no lo puede abrir (404)', async () => {
    await api(app, residente1)
      .post(`comunicados/${announcementId}/lectura`)
      .expect(404);
  });

  it('H27: al vencer pasa a archivados', async () => {
    await db(app).announcement.update({
      where: { id: announcementId },
      data: { expiresOn: new Date(`${addDays(todayIso(), -1)}T00:00:00Z`) },
    });

    await expect(vigentes(residente4)).resolves.toMatchObject({ total: 0 });
    const { body } = await api(app, residente4)
      .get('comunicados?tab=archivados')
      .expect(200);
    expect(body.total).toBe(1);
  });

  it('H25: un comunicado para todos llega a los 6 residentes', async () => {
    const { body } = await publish({
      title: 'Asamblea de fin de año',
      category: 'AVISO_GENERAL',
      audience: 'TODOS',
      towerIds: undefined,
    }).expect(201);
    expect(body.recipientCount).toBe(6);

    await expect(vigentes(residente1)).resolves.toMatchObject({ total: 1 });
    const notifications = await inbox(app, residente1);
    expect(notifications).toHaveLength(1);
  });
});
