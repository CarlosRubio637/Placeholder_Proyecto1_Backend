import type { INestApplication } from '@nestjs/common';
import { addDays, todayIso } from '../../src/common/time/index.js';
import { api, createTestApp, db, login, resetData } from '../support/app.js';

type AdminSummary = {
  id: string;
  status: string;
  readCount: number;
  recipientCount: number;
  readPct: number;
};

type Reader = {
  fullName: string | null;
  unitCode: string;
  readAt: string | null;
};

type Reads = {
  announcement: AdminSummary & { body: string };
  data: Reader[];
  total: number;
};

const MISSING_ID = '3c2b1a09-8f7e-4d6c-9b5a-4e3d2c1b0a9f';

describe('H26. Comunicados publicados y control de lecturas', () => {
  let app: INestApplication;
  let admin: string;
  let residente4: string;
  let residente5: string;
  let seguridad: string;
  let announcementId: string;

  const listed = async (query = ''): Promise<AdminSummary[]> => {
    const { body } = await api(app, admin)
      .get(`admin/comunicados${query}`)
      .expect(200);
    return (body as { data: AdminSummary[] }).data;
  };

  const summary = async (): Promise<AdminSummary | undefined> =>
    (await listed()).find((row) => row.id === announcementId);

  const reads = async (query = ''): Promise<Reads> => {
    const { body } = await api(app, admin)
      .get(`admin/comunicados/${announcementId}/lecturas${query}`)
      .expect(200);
    return body as Reads;
  };

  const residentView = async (token: string) => {
    const { body } = await api(app, token).get('comunicados').expect(200);
    return (body as { data: { id: string; readAt: string | null }[] }).data.find(
      (row) => row.id === announcementId,
    );
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente4, residente5, seguridad] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente4'),
      login(app, 'residente5'),
      login(app, 'seguridad1'),
    ]);
    const towerB = await db(app).tower.findUniqueOrThrow({
      where: { letter: 'B' },
    });
    const { body } = await api(app, admin)
      .post('admin/comunicados')
      .send({
        title: 'Mantenimiento de ascensores',
        body: 'El lunes no habrá ascensores de 8:00 a 12:00.',
        category: 'MANTENIMIENTO',
        audience: 'TORRES',
        towerIds: [towerB.id],
        expiresOn: addDays(todayIso(), 10),
      })
      .expect(201);
    announcementId = (body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC4: recién publicado tiene 0 lecturas de 2 destinatarios', async () => {
    await expect(summary()).resolves.toMatchObject({
      status: 'VIGENTE',
      readCount: 0,
      recipientCount: 2,
      readPct: 0,
    });
  });

  it('AC5: cuando residente5 lo abre en H27, el administrador ve 1 de 2 y la misma fecha de lectura', async () => {
    const { body: opened } = await api(app, residente5)
      .post(`comunicados/${announcementId}/lectura`)
      .expect(200);

    await expect(summary()).resolves.toMatchObject({
      readCount: 1,
      recipientCount: 2,
      readPct: 50,
    });
    const { data } = await reads();
    expect(data).toEqual([
      { fullName: 'Roberto Díaz', unitCode: 'B-101', readAt: null },
      {
        fullName: 'Sofía Castillo',
        unitCode: 'B-203',
        readAt: (opened as { readAt: string }).readAt,
      },
    ]);
  });

  it('AC5: cada destinatario ve en H27 la misma lectura que ve el administrador', async () => {
    const { data } = await reads();
    const byUnit = new Map(data.map((row) => [row.unitCode, row.readAt]));
    await expect(residentView(residente4)).resolves.toMatchObject({
      readAt: byUnit.get('B-101'),
    });
    await expect(residentView(residente5)).resolves.toMatchObject({
      readAt: byUnit.get('B-203'),
    });
  });

  it('AC4: el filtro No leído deja solo a quien no lo abrió y conserva los conteos del comunicado', async () => {
    const unread = await reads('?read=false');
    expect(unread.data.map((row) => row.unitCode)).toEqual(['B-101']);
    expect(unread.total).toBe(1);
    expect(unread.announcement).toMatchObject({
      body: 'El lunes no habrá ascensores de 8:00 a 12:00.',
      readCount: 1,
      recipientCount: 2,
      readPct: 50,
    });
  });

  it.each([
    ['residente', () => residente5],
    ['seguridad', () => seguridad],
  ])('AC6: %s recibe 403 en la lista y en las lecturas', async (_rol, token) => {
    await api(app, token()).get('admin/comunicados').expect(403);
    await api(app, token())
      .get(`admin/comunicados/${announcementId}/lecturas`)
      .expect(403);
  });

  it('un comunicado que no existe responde 404 y un id mal formado 400', async () => {
    const { body } = await api(app, admin)
      .get(`admin/comunicados/${MISSING_ID}/lecturas`)
      .expect(404);
    expect(body).toMatchObject({ message: 'El comunicado no existe.' });
    await api(app, admin).get('admin/comunicados/abc/lecturas').expect(400);
  });

  it('al vencer pasa a Archivado y el filtro de estado lo encuentra', async () => {
    await db(app).announcement.update({
      where: { id: announcementId },
      data: { expiresOn: new Date(`${addDays(todayIso(), -1)}T00:00:00Z`) },
    });
    const archived = await listed('?status=ARCHIVADO');
    expect(archived.map((row) => [row.id, row.status])).toEqual([
      [announcementId, 'ARCHIVADO'],
    ]);
    await expect(listed('?status=VIGENTE')).resolves.toEqual([]);
  });
});
