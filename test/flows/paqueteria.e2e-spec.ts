import type { INestApplication } from '@nestjs/common';
import {
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

/** Flujo H19 → H30 → H31 → H20 → H21: un paquete llega a portería y se entrega. */
describe('Flujo de paquetería (H19, H30, H31, H20, H21)', () => {
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

  describe('H21: entrega en portería', () => {
    const MISSING_ID = '3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11';
    const pickup = {
      pickedUpByName: 'Ana María López',
      pickedUpByDocType: 'DUI',
      pickedUpByDocNumber: '01234567-8',
    };
    let packageId: string;

    const deliver = (id: string, change: object = {}, token = seguridad) =>
      api(app, token)
        .post(`seguridad/paquetes/${id}/entrega`)
        .send({ ...pickup, ...change });

    beforeAll(async () => {
      const pkg = await db(app).package.findUniqueOrThrow({ where: { code } });
      packageId = pkg.id;
    });

    it.each<[string, object, string]>([
      [
        'un nombre de menos de 3 letras',
        { pickedUpByName: 'Al' },
        'pickedUpByName',
      ],
      ['un nombre vacío', { pickedUpByName: '' }, 'pickedUpByName'],
      [
        'un nombre con números',
        { pickedUpByName: 'Ana 123' },
        'pickedUpByName',
      ],
      [
        'un DUI mal formado',
        { pickedUpByDocNumber: '0123456-78' },
        'pickedUpByDocNumber',
      ],
      [
        'un documento vacío',
        { pickedUpByDocNumber: '' },
        'pickedUpByDocNumber',
      ],
      [
        'un pasaporte inválido',
        { pickedUpByDocType: 'PASAPORTE', pickedUpByDocNumber: 'A1-23' },
        'pickedUpByDocNumber',
      ],
      [
        'un tipo de documento inválido',
        { pickedUpByDocType: 'LICENCIA' },
        'pickedUpByDocType',
      ],
    ])('rechaza %s con 400 y el campo', async (_caso, change, field) => {
      const { body } = await deliver(packageId, change).expect(400);
      expect(body).toMatchObject({ statusCode: 400, field });
      expect(body.message).toEqual([expect.any(String)]);
    });

    it('ningún rechazo cambió el paquete', async () => {
      const pkg = await db(app).package.findUniqueOrThrow({
        where: { id: packageId },
      });
      expect(pkg).toMatchObject({
        status: 'PENDIENTE_ENTREGA',
        deliveredAt: null,
        pickedUpByName: null,
      });
    });

    it('un paquete inexistente responde 404', async () => {
      const { body } = await deliver(MISSING_ID).expect(404);
      expect(body.message).toBe('El paquete no existe.');
    });

    it('entrega el paquete y guarda quién lo recogió y qué agente lo entregó', async () => {
      const { body } = await deliver(packageId).expect(200);
      expect(body).toMatchObject({
        id: packageId,
        code,
        status: 'ENTREGADO',
        pickedUpByName: 'Ana María López',
      });

      const agent = await db(app).user.findUniqueOrThrow({
        where: { email: 'seguridad1@condominio.test' },
      });
      const pkg = await db(app).package.findUniqueOrThrow({
        where: { id: packageId },
      });
      expect(pkg).toMatchObject({
        status: 'ENTREGADO',
        deliveredById: agent.id,
        pickedUpByName: 'Ana María López',
        pickedUpByDocType: 'DUI',
        pickedUpByDocNumber: '01234567-8',
      });
      expect(pkg.deliveredAt).toBeInstanceOf(Date);
    });

    it('avisa "Paquete entregado" solo a los residentes de la unidad', async () => {
      const notifications = await inbox(app, residente4);
      const delivered = notifications.filter(
        (item) => item.title === 'Paquete entregado',
      );
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toMatchObject({
        sourceModule: 'PAQUETERIA',
        referenceId: packageId,
      });
      expect(delivered[0].message).toMatch(
        new RegExp(
          `^El paquete ${code} se entregó a Ana María López el \\d{2}/\\d{2}/\\d{4} a las \\d{2}:\\d{2}\\. Si no fuiste tú ni alguien de tu confianza, avisa a portería\\.$`,
        ),
      );

      await expect(inbox(app, residente3)).resolves.toEqual([]);
    });

    it('entregarlo otra vez responde 409 con la fecha y quién lo recogió', async () => {
      const before = await db(app).package.findUniqueOrThrow({
        where: { id: packageId },
      });

      const { body } = await deliver(packageId, {
        pickedUpByName: 'Otra Persona',
      }).expect(409);
      expect(body.message).toMatch(
        /^Este paquete ya fue entregado el \d{2}\/\d{2}\/\d{4} a Ana María López\.$/,
      );

      const after = await db(app).package.findUniqueOrThrow({
        where: { id: packageId },
      });
      expect(after).toEqual(before);
    });

    it('dos agentes a la vez: solo una entrega queda (200 y 409)', async () => {
      const created = await send(seguridad, {
        trackingNumber: '9911-0001',
      }).expect(201);
      const id = created.body.id as string;
      const seguridad2 = await login(app, 'seguridad2');

      const results = await Promise.all([
        deliver(id, { pickedUpByName: 'Primera Persona' }, seguridad),
        deliver(id, { pickedUpByName: 'Segunda Persona' }, seguridad2),
      ]);

      expect(
        results.map((result) => result.status).sort((a, b) => a - b),
      ).toEqual([200, 409]);
      const winner = results.find((result) => result.status === 200);
      const pkg = await db(app).package.findUniqueOrThrow({ where: { id } });
      expect(pkg.status).toBe('ENTREGADO');
      expect(pkg.pickedUpByName).toBe(winner?.body.pickedUpByName);
    });

    it('guarda el pasaporte en mayúsculas, como en visitas', async () => {
      const created = await send(seguridad, {
        trackingNumber: '9911-0002',
      }).expect(201);
      const id = created.body.id as string;

      await deliver(id, {
        pickedUpByDocType: 'PASAPORTE',
        pickedUpByDocNumber: 'ab123456',
      }).expect(200);

      const pkg = await db(app).package.findUniqueOrThrow({ where: { id } });
      expect(pkg).toMatchObject({
        pickedUpByDocType: 'PASAPORTE',
        pickedUpByDocNumber: 'AB123456',
      });
    });
  });
});
