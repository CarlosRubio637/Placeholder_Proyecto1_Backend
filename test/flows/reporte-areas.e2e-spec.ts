import type { INestApplication } from '@nestjs/common';
import { addDays, todayIso, toDbDate } from '../../src/common/time/index.js';
import { api, createTestApp, db, login, resetData } from '../support/app.js';

type AreaRow = {
  areaId: string;
  name: string;
  confirmed: number;
  cancelled: number;
  reservedHours: number;
  enabledHours: number;
  occupancyPct: number;
};

/** Flujo H9 → H7 → H33: las reservas y los bloqueos alimentan el reporte. */
describe('Flujo del reporte de uso de áreas comunes (H9, H7, H33)', () => {
  let app: INestApplication;
  let admin: string;
  let residente1: string; // A-101
  let residente3: string; // A-102
  let residente4: string; // B-101
  let seguridad: string;
  let canchaId: string;
  let salaId: string;

  const today = todayIso();
  const day = addDays(today, 3);
  // 10 días: de hoy a hoy + 9.
  const range = `from=${today}&to=${addDays(today, 9)}`;

  const createArea = async (name: string, closeTime: string) => {
    const { body } = await api(app, admin)
      .post('admin/areas')
      .send({
        name,
        capacity: 10,
        openTime: '08:00',
        closeTime,
        slotMinutes: 60,
      })
      .expect(201);
    return body.id as string;
  };

  const reserve = (token: string, startTime: string) =>
    api(app, token)
      .post('reservas')
      .send({
        areaId: canchaId,
        date: day,
        startTime,
        attendees: 2,
        acceptRules: true,
      })
      .expect(201);

  const report = async (query = range) => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/areas?${query}`)
      .expect(200);
    return body as {
      data: AreaRow[];
      mostUsed: { areaId: string; name: string } | null;
      leastUsed: { areaId: string; name: string } | null;
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, residente1, residente3, residente4, seguridad] = await Promise.all([
      login(app, 'admin'),
      login(app, 'residente1'),
      login(app, 'residente3'),
      login(app, 'residente4'),
      login(app, 'seguridad1'),
    ]);

    canchaId = await createArea('Cancha del reporte', '14:00'); // 6 h por día
    salaId = await createArea('Sala del reporte', '10:00'); // 2 h por día

    await reserve(residente1, '09:00');
    await reserve(residente3, '10:00');
    const cancelled = await reserve(residente4, '11:00');
    // H8 (cancelar) todavía no tiene endpoint: se cancela directo en la base.
    await db(app).reservation.update({
      where: { id: cancelled.body.id },
      data: { status: 'CANCELADA', slotKey: null, cancelledAt: new Date() },
    });

    // Dos días bloqueados de la cancha dentro del periodo, sin reservas.
    const { id: adminId } = await db(app).user.findFirstOrThrow({
      where: { role: 'ADMINISTRADOR' },
      select: { id: true },
    });
    await db(app).areaBlock.create({
      data: {
        areaId: canchaId,
        startDate: toDbDate(addDays(today, 6)),
        endDate: toDbDate(addDays(today, 7)),
        reason: 'Mantenimiento de prueba',
        createdById: adminId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('calcula las cifras del área con las reservas y los bloqueos', async () => {
    const { data } = await report();
    expect(data.find((row) => row.areaId === canchaId)).toEqual({
      areaId: canchaId,
      name: 'Cancha del reporte',
      confirmed: 2,
      cancelled: 1,
      reservedHours: 2,
      enabledHours: 8 * 6, // 10 días − 2 bloqueados, 6 h cada uno
      occupancyPct: 4.2, // 2 / 48 × 100 = 4.16…
    });
  });

  it('va de mayor a menor ocupación y marca la más y la menos usada', async () => {
    const { data, mostUsed, leastUsed } = await report();
    expect(data[0].areaId).toBe(canchaId);
    expect(mostUsed).toEqual({ areaId: canchaId, name: 'Cancha del reporte' });

    // Las demás quedan en 0 % y 0 reservas: la menos usada es la primera por nombre.
    const zero = data
      .filter((row) => row.confirmed === 0)
      .map((row) => row.name)
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    expect(leastUsed?.name).toBe(zero[0]);
  });

  it('un área deshabilitada no aparece', async () => {
    expect((await report()).data.map((row) => row.areaId)).toContain(salaId);

    await db(app).commonArea.update({
      where: { id: salaId },
      data: { isActive: false },
    });
    expect((await report()).data.map((row) => row.areaId)).not.toContain(
      salaId,
    );
  });

  it('sin reservas en el periodo, más y menos usada son null', async () => {
    const empty = `from=${addDays(today, -10)}&to=${addDays(today, -1)}`;
    const body = await report(empty);
    expect(body.data.every((row) => row.confirmed === 0)).toBe(true);
    expect(body.mostUsed).toBeNull();
    expect(body.leastUsed).toBeNull();
  });

  it('sin fechas usa el mes actual', async () => {
    const body = await report('');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it.each([
    ['un rango invertido', `from=${today}&to=${addDays(today, -1)}`, 'to'],
    ['más de 366 días', `from=${addDays(today, -367)}&to=${today}`, 'to'],
    ['una fecha inválida', 'from=ayer', 'from'],
  ])('rechaza %s con el campo (400)', async (_caso, query, field) => {
    const { body } = await api(app, admin)
      .get(`admin/reportes/areas?${query}`)
      .expect(400);
    expect(body).toMatchObject({ field });
  });

  it('el Residente y Seguridad no pueden verlo (403)', async () => {
    await api(app, residente1).get(`admin/reportes/areas?${range}`).expect(403);
    await api(app, seguridad).get(`admin/reportes/areas?${range}`).expect(403);
  });
});
