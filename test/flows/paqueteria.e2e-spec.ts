import type { INestApplication } from '@nestjs/common';
import {
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

/** Flujo H19 → H30 → H31 → H20: un paquete llega a portería. */
describe('Flujo de paquetería (H19, H30, H31, H20)', () => {
  let app: INestApplication;
  let seguridad: string;
  let admin: string;
  let residente3: string; // A-102
  let residente4: string; // B-101
  let unitId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [seguridad, admin, residente3, residente4] = await Promise.all([
      login(app, 'seguridad1'),
      login(app, 'admin'),
      login(app, 'residente3'),
      login(app, 'residente4'),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (token: string, change: object = {}) =>
    api(app, token)
      .post('seguridad/paquetes')
      .send({ unitId, courier: 'DHL', trackingNumber: '4581-2203', ...change });

  it('Seguridad encuentra la unidad con los selectores de torre y unidad', async () => {
    const towers = await api(app, seguridad).get('torres').expect(200);
    expect(towers.body).toHaveLength(3);
    const tower = towers.body.find(
      (item: { letter: string }) => item.letter === 'B',
    );

    const units = await api(app, seguridad)
      .get(`unidades?towerId=${tower.id}`)
      .expect(200);
    expect(units.body).toHaveLength(16);
    expect(units.body[0]).not.toHaveProperty('registrationCode');
    unitId = units.body.find(
      (item: { code: string }) => item.code === 'B-101',
    ).id;
  });

  it.each([
    ['un residente', () => residente4],
    ['la administración', () => admin],
  ])('%s no puede registrar paquetes (403)', async (_caso, token) => {
    await send(token()).expect(403);
  });

  it('valida los datos con el campo que falló', async () => {
    const { body } = await send(seguridad, { courier: 'X' }).expect(400);
    expect(body).toMatchObject({ field: 'courier' });
  });

  it('una unidad inexistente responde 404', async () => {
    await send(seguridad, {
      unitId: '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11',
    }).expect(404);
  });

  it('una unidad sin residentes activos responde 409', async () => {
    const empty = await db(app).unit.findUniqueOrThrow({
      where: { code: 'C-101' },
    });
    await send(seguridad, { unitId: empty.id }).expect(409);
  });

  let code: string;

  it('H19: registra el paquete con código consecutivo', async () => {
    const { body } = await send(seguridad).expect(201);
    expect(body.code).toMatch(/^PQ-\d{8}-0001$/);
    expect(body).toMatchObject({
      courier: 'DHL',
      status: 'PENDIENTE_ENTREGA',
    });
    code = body.code;
  });

  it('H30 y H31: avisa a los residentes de la unidad y a nadie más', async () => {
    const notifications = await inbox(app, residente4);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      title: 'Tienes un paquete en portería',
      sourceModule: 'PAQUETERIA',
    });
    expect(notifications[0].message).toContain('DHL');
    expect(notifications[0].message).toContain(code);

    await expect(inbox(app, residente3)).resolves.toEqual([]);
  });

  it('H20: el residente lo ve pendiente en "Mis paquetes"', async () => {
    const { body } = await api(app, residente4)
      .get('paquetes/mios?status=PENDIENTE_ENTREGA')
      .expect(200);
    expect(body.pendingCount).toBe(1);
    expect(body.data[0]).toMatchObject({ code, courier: 'DHL' });
  });

  it('H20: otra unidad no lo ve', async () => {
    const { body } = await api(app, residente3)
      .get('paquetes/mios?status=PENDIENTE_ENTREGA')
      .expect(200);
    expect(body).toMatchObject({ pendingCount: 0, data: [] });
  });

  it('H20: no se puede pedir la lista de otra unidad', async () => {
    const { body } = await api(app, residente3)
      .get(`paquetes/mios?status=PENDIENTE_ENTREGA&unitId=${unitId}`)
      .expect(400);
    expect(body).toMatchObject({ field: 'unitId' });
  });

  it('H19: Seguridad lo encuentra por búsqueda y filtro', async () => {
    const { body } = await api(app, seguridad)
      .get(`seguridad/paquetes?status=PENDIENTE_ENTREGA&search=4581`)
      .expect(200);
    expect(body.total).toBe(1);
    expect(body.data[0].code).toBe(code);
  });
});
