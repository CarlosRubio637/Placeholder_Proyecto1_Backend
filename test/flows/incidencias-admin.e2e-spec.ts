import type { INestApplication } from '@nestjs/common';
import {
  PNG,
  api,
  createTestApp,
  db,
  login,
  resetData,
} from '../support/app.js';

const DAY = 24 * 60 * 60 * 1000;

/** Flujo H10 → H12 → H11: la administración prioriza y asigna. */
describe('Flujo de la bandeja del administrador (H10, H12, H11)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string; // A-101
  let residente3: string; // A-102
  let staff: { id: string; name: string }[];

  type Created = { id: string; number: string };
  const report = async (
    token: string,
    title: string,
    location = 'TORRE_A',
  ): Promise<Created> => {
    const { body } = await api(app, token)
      .post('incidencias')
      .field('title', title)
      .field('description', 'Descripción de la incidencia de prueba.')
      .field('location', location)
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    return body as Created;
  };

  const inbox = (query = '') =>
    api(app, admin).get(`admin/incidencias${query ? `?${query}` : ''}`);
  const patch = (id: string, body: object) =>
    api(app, admin).patch(`admin/incidencias/${id}`).send(body);

  let fuga: Created; // A-101, Torre A
  let luz: Created; // A-102, Piscina
  let ruido: Created; // A-101, Lobby

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, residente3] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'residente3'),
    ]);
    fuga = await report(residente1, 'Fuga de agua en el baño');
    luz = await report(residente3, 'Luz quemada en la piscina', 'PISCINA');
    ruido = await report(residente1, 'Ruido en el ascensor', 'LOBBY');
    // Antigüedades distintas para el orden por defecto.
    await db(app).incident.update({
      where: { id: fuga.id },
      data: { createdAt: new Date(Date.now() - 5 * DAY) },
    });
    await db(app).incident.update({
      where: { id: luz.id },
      data: { createdAt: new Date(Date.now() - 2 * DAY) },
    });
  });

  afterAll(async () => {
    await resetData(app);
    await app.close();
  });

  it('el catálogo trae solo los responsables activos', async () => {
    const inactive = await db(app).maintenanceStaff.create({
      data: {
        name: 'Ex Empleado',
        specialty: 'Pintura',
        phone: '7000-0000',
        isActive: false,
      },
    });
    const { body } = await api(app, admin)
      .get('admin/responsables')
      .expect(200);
    staff = body.data;
    expect(staff.map((item) => item.name)).toEqual([
      'Miguel Torres',
      'Pedro Alvarado',
      'Rosa Méndez',
    ]);
    expect(staff[0]).toEqual({
      id: expect.any(String),
      name: 'Miguel Torres',
      specialty: 'Electricidad',
      phone: '7200-0002',
    });

    const { body: rejected } = await patch(fuga.id, {
      assigneeId: inactive.id,
    }).expect(400);
    expect(rejected).toMatchObject({
      field: 'assigneeId',
      message: ['El responsable no existe o está inactivo.'],
    });
  });

  it('sin cambios todavía, la más antigua va primero (todas en Media)', async () => {
    const { body } = await inbox().expect(200);
    expect(body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    expect(body.data.map((item: Created) => item.number)).toEqual([
      fuga.number,
      luz.number,
      ruido.number,
    ]);
    expect(body.data[0]).toMatchObject({
      unitCode: 'A-101',
      location: 'TORRE_A',
      status: 'PENDIENTE',
      priority: 'MEDIA',
      assignee: null,
      daysOpen: 5,
    });
  });

  it('cambia prioridad y responsable, con un evento por cada cambio', async () => {
    const pedro = staff.find((item) => item.name === 'Pedro Alvarado')!;
    const { body } = await patch(luz.id, {
      priority: 'ALTA',
      assigneeId: pedro.id,
    }).expect(200);

    expect(body.incident).toMatchObject({
      id: luz.id,
      priority: 'ALTA',
      assignee: { id: pedro.id, name: 'Pedro Alvarado' },
    });
    expect(body.event).toMatchObject({
      type: 'ASIGNACION',
      fromValue: null,
      toValue: 'Pedro Alvarado',
    });

    // El residente lo ve en su historial (H11), firmado por "Administración".
    const detail = await api(app, residente3)
      .get(`incidencias/${luz.id}`)
      .expect(200);
    expect(detail.body.assignee).toEqual({
      id: pedro.id,
      name: 'Pedro Alvarado',
      specialty: 'Fontanería',
    });
    const events = detail.body.events.slice(1);
    expect(events).toMatchObject([
      {
        type: 'PRIORIDAD',
        fromValue: 'MEDIA',
        toValue: 'ALTA',
        authorLabel: 'Administración',
      },
      {
        type: 'ASIGNACION',
        fromValue: null,
        toValue: 'Pedro Alvarado',
        authorLabel: 'Administración',
      },
    ]);
  });

  it('el orden pone primero la prioridad Alta, aunque sea más reciente', async () => {
    await patch(ruido.id, { priority: 'BAJA' }).expect(200);
    const { body } = await inbox().expect(200);
    expect(body.data.map((item: Created) => item.number)).toEqual([
      luz.number, // Alta
      fuga.number, // Media
      ruido.number, // Baja
    ]);
  });

  it('guardar los mismos valores no agrega eventos', async () => {
    const before = await db(app).incidentEvent.count({
      where: { incidentId: luz.id },
    });
    const { body } = await patch(luz.id, { priority: 'ALTA' }).expect(200);
    expect(body.event).toBeNull();
    await expect(
      db(app).incidentEvent.count({ where: { incidentId: luz.id } }),
    ).resolves.toBe(before);
  });

  it('quitar el responsable deja el evento hacia "Sin asignar"', async () => {
    const { body } = await patch(luz.id, { assigneeId: null }).expect(200);
    expect(body.incident.assignee).toBeNull();
    expect(body.event).toMatchObject({
      type: 'ASIGNACION',
      fromValue: 'Pedro Alvarado',
      toValue: null,
    });
  });

  describe('filtros y búsqueda', () => {
    beforeAll(async () => {
      const rosa = staff.find((item) => item.name === 'Rosa Méndez')!;
      await patch(fuga.id, { assigneeId: rosa.id }).expect(200);
    });

    const numbers = async (query: string) => {
      const { body } = await inbox(query).expect(200);
      return body.data.map((item: Created) => item.number);
    };

    it.each([
      ['prioridad', () => 'priority=ALTA', () => [luz.number]],
      ['ubicación', () => 'location=LOBBY', () => [ruido.number]],
      [
        'sin responsable',
        () => 'assigneeId=none',
        () => [luz.number, ruido.number],
      ],
      [
        'un responsable',
        () => `assigneeId=${staff.find((s) => s.name === 'Rosa Méndez')!.id}`,
        () => [fuga.number],
      ],
      ['estado', () => 'status=EN_PROCESO', () => []],
      [
        'búsqueda sin tildes ni mayúsculas',
        () => `search=${encodeURIComponent('FÚGA de AGUA')}`,
        () => [fuga.number],
      ],
      [
        'búsqueda por número',
        () => `search=${luz.number.toLowerCase()}`,
        () => [luz.number],
      ],
      [
        'búsqueda por parte del título',
        () => 'search=ascen',
        () => [ruido.number],
      ],
    ])('por %s', async (_caso, query, expected) => {
      await expect(numbers(query())).resolves.toEqual(expected());
    });

    it('combina filtros', async () => {
      await expect(numbers('location=TORRE_A&priority=BAJA')).resolves.toEqual(
        [],
      );
    });

    it('pagina', async () => {
      const { body } = await inbox('page=2&pageSize=2').expect(200);
      expect(body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(body.data).toHaveLength(1);
    });

    it('un filtro inválido responde 400 con el campo', async () => {
      const { body } = await inbox('assigneeId=pedro').expect(400);
      expect(body).toMatchObject({ field: 'assigneeId' });
    });
  });

  describe('reglas', () => {
    it('400 sin prioridad ni responsable', async () => {
      const { body } = await patch(fuga.id, {}).expect(400);
      expect(body.message).toEqual(['Indica la prioridad o el responsable.']);
    });

    it('400 si intenta cambiar el estado por aquí', async () => {
      const { body } = await patch(fuga.id, { status: 'RESUELTO' }).expect(400);
      expect(body).toMatchObject({ field: 'status' });
    });

    it('404 si la incidencia no existe', async () => {
      await patch('3f2b1c9e-8a4d-4e6f-9b1a-7c5d2e8f0a11', {
        priority: 'ALTA',
      }).expect(404);
    });

    it('409 si está Resuelto, sin tocar nada', async () => {
      await db(app).incident.update({
        where: { id: ruido.id },
        data: { status: 'RESUELTO', resolvedAt: new Date() },
      });
      const { body } = await patch(ruido.id, { priority: 'ALTA' }).expect(409);
      expect(body.message).toBe(
        'La incidencia está resuelta. Reábrela para modificarla.',
      );
      const saved = await db(app).incident.findUniqueOrThrow({
        where: { id: ruido.id },
      });
      expect(saved.priority).toBe('BAJA');
    });

    it('dos cambios simultáneos dejan un historial consistente', async () => {
      const results = await Promise.all([
        patch(fuga.id, { priority: 'ALTA' }),
        patch(fuga.id, { priority: 'BAJA' }),
      ]);
      expect(results.map((result) => result.status)).toEqual([200, 200]);

      const events = await db(app).incidentEvent.findMany({
        where: { incidentId: fuga.id, type: 'PRIORIDAD' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(events).toHaveLength(2);
      // El segundo parte del valor que dejó el primero, no del original.
      expect(events[0].fromValue).toBe('MEDIA');
      expect(events[1].fromValue).toBe(events[0].toValue);
      const saved = await db(app).incident.findUniqueOrThrow({
        where: { id: fuga.id },
      });
      expect(saved.priority).toBe(events[1].toValue);
    });
  });
});
