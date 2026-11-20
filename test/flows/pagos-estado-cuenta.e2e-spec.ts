import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  api,
  createTestApp,
  db,
  inbox,
  login,
  resetData,
} from '../support/app.js';

/**
 * H2 → H1 → H2: estado de cuenta, pago con la pasarela simulada, recibo y
 * administración de la unidad. Cubre los criterios de las cards de H1 y H2.
 *
 * Usa las cuotas del seed: A-102 (residente3) tiene 2026-10 Pendiente y
 * B-203 (residente5) tiene 2026-09 Morosa y 2026-10 Pendiente. Las cuotas son
 * datos del seed que se conservan entre flujos, así que se restauran al final.
 */
describe('Estado de cuenta y pago de cuotas (H2, H1)', () => {
  let app: INestApplication;
  let admin: string;
  let seguridad: string;
  let residente1: string; // A-101
  let residente3: string; // A-102
  let residente5: string; // B-203
  let snapshot: {
    id: string;
    status: 'PENDIENTE' | 'PAGADO' | 'MOROSO';
    paidAt: Date | null;
  }[];

  const card = (
    cardNumber = '4242 4242 4242 4242',
    extra: Record<string, unknown> = {},
  ) => ({
    idempotencyKey: randomUUID(),
    cardNumber,
    expMonth: 12,
    expYear: 2030,
    cvv: '123',
    holderName: 'Ana Lopez',
    ...extra,
  });

  const statement = async (token: string, query = '') =>
    (await api(app, token).get(`estado-cuenta${query}`).expect(200)).body as {
      unit: { id: string; code: string };
      summary: {
        pendingBalance: number;
        overdueCount: number;
        nextDueDate: string | null;
      };
      years: number[];
      data: { id: string; period: string; status: string; amount: number }[];
      total: number;
    };

  /** Lo que debe dar el resumen, calculado directo de la base. */
  const expectedSummary = async (code: string) => {
    const fees = await db(app).fee.findMany({ where: { unit: { code } } });
    const payable = fees.filter((fee) => fee.status !== 'PAGADO');
    const pending = fees
      .filter((fee) => fee.status === 'PENDIENTE')
      .map((fee) => fee.dueDate.toISOString().slice(0, 10))
      .sort((a, b) => a.localeCompare(b));
    return {
      pendingBalance: payable.reduce(
        (sum, fee) => sum + fee.amount.toNumber(),
        0,
      ),
      overdueCount: fees.filter((fee) => fee.status === 'MOROSO').length,
      nextDueDate: pending[0] ?? null,
    };
  };

  /** Una cuota Pendiente o Morosa de la unidad, la más antigua. */
  const payableFee = async (code: string) =>
    db(app).fee.findFirstOrThrow({
      where: { unit: { code }, status: { in: ['PENDIENTE', 'MOROSO'] } },
      orderBy: { period: 'asc' },
    });

  beforeAll(async () => {
    app = await createTestApp();
    await resetData(app);
    [admin, seguridad, residente1, residente3, residente5] = await Promise.all([
      login(app, 'admin'),
      login(app, 'seguridad1'),
      login(app, 'residente1'),
      login(app, 'residente3'),
      login(app, 'residente5'),
    ]);
    snapshot = await db(app).fee.findMany({
      select: { id: true, status: true, paidAt: true },
    });
  });

  afterAll(async () => {
    await resetData(app);
    for (const fee of snapshot) {
      await db(app).fee.update({
        where: { id: fee.id },
        data: { status: fee.status, paidAt: fee.paidAt },
      });
    }
    await app.close();
  });

  describe('H2: estado de cuenta', () => {
    it('resume el saldo pendiente, las morosas y el próximo vencimiento', async () => {
      const body = await statement(residente5);
      expect(body.unit.code).toBe('B-203');
      expect(body.summary).toEqual(await expectedSummary('B-203'));
      expect(body.years.length).toBeGreaterThan(0);
      // Periodo del más reciente al más antiguo.
      const periods = body.data.map((fee) => fee.period);
      expect(periods).toEqual([...periods].sort((a, b) => b.localeCompare(a)));
      expect(body).toMatchObject({ page: 1, pageSize: 12 });
    });

    it('el saldo no cambia con los filtros, la tabla sí', async () => {
      const expected = await expectedSummary('B-203');
      const body = await statement(residente5, '?status=PAGADO');
      expect(body.data.every((fee) => fee.status === 'PAGADO')).toBe(true);
      expect(body.summary).toEqual(expected);

      const empty = await statement(residente5, '?year=2020');
      expect(empty.data).toEqual([]);
      expect(empty.total).toBe(0);
      expect(empty.summary).toEqual(expected);
    });

    it.each([
      ['?year=2019', 'year'],
      ['?year=2101', 'year'],
      ['?status=VENCIDA', 'status'],
      ['?pageSize=51', 'pageSize'],
    ])('rechaza el filtro inválido %s (400)', async (query, field) => {
      const { body } = await api(app, residente5)
        .get(`estado-cuenta${query}`)
        .expect(400);
      expect(body.field).toBe(field);
    });

    it('cada residente ve solo su unidad, aunque mande otro id', async () => {
      const own = await statement(residente1, `?unitId=${randomUUID()}`).catch(
        () => null,
      );
      // forbidNonWhitelisted rechaza el parámetro; sin él, ve su propia unidad.
      expect(own).toBeNull();
      const body = await statement(residente1);
      expect(body.unit.code).toBe('A-101');
    });

    it('Seguridad no consulta estados de cuenta (403)', async () => {
      await api(app, seguridad).get('estado-cuenta').expect(403);
    });
  });

  describe('H1: pago de cuota', () => {
    let pendingId: string;
    let pendingStatus: string;
    let period: string;
    let approvedPaymentId: string;

    beforeAll(async () => {
      const fee = await payableFee('A-102');
      pendingId = fee.id;
      pendingStatus = fee.status;
      period = fee.period;
    });

    it('muestra la cuota a pagar', async () => {
      const { body } = await api(app, residente3)
        .get(`cuotas/${pendingId}`)
        .expect(200);
      expect(body).toMatchObject({
        id: pendingId,
        status: pendingStatus,
        amount: 45,
        period,
      });
      expect(body).toHaveProperty('concept');
      expect(body).toHaveProperty('dueDate');
    });

    it('otra unidad no ve ni paga la cuota (404)', async () => {
      await api(app, residente1).get(`cuotas/${pendingId}`).expect(404);
      const { body } = await api(app, residente1)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card())
        .expect(404);
      expect(body.message).toBe('La cuota no existe.');
    });

    it.each([
      [{ cardNumber: '4242' }, 'cardNumber'],
      [{ cvv: '12' }, 'cvv'],
      [{ holderName: 'A1' }, 'holderName'],
      [{ expMonth: 13 }, 'expMonth'],
      [{ expYear: 2026, expMonth: 1 }, 'expMonth'],
      [{ idempotencyKey: 'no' }, 'idempotencyKey'],
    ])('rechaza datos inválidos %o (400)', async (extra, field) => {
      const { body } = await api(app, residente3)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card(undefined, extra))
        .expect(400);
      expect(body.field).toBe(field);
    });

    it('la tarjeta 0002 rechaza con su motivo y la cuota no cambia', async () => {
      const { body } = await api(app, residente3)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card('4000 0000 0000 0002'))
        .expect(201);
      expect(body).toMatchObject({
        status: 'RECHAZADO',
        failureReason: 'Fondos insuficientes',
        cardLast4: '0002',
        fee: { id: pendingId, status: pendingStatus },
      });
      expect(body.transactionNumber).toMatch(/^TX-\d{8}-\d{6}$/);

      const [notification] = await inbox(app, residente3);
      expect(notification).toMatchObject({
        title: 'Pago rechazado',
        sourceModule: 'CUOTAS',
        referenceId: body.id,
      });
      expect(notification.message).toBe(
        `Tu pago de la cuota ${period} fue rechazado: Fondos insuficientes.`,
      );
    });

    it('otra tarjeta no se reconoce', async () => {
      const { body } = await api(app, residente3)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card('5555 5555 5555 4444'))
        .expect(201);
      expect(body.failureReason).toBe(
        'Tarjeta no reconocida por la pasarela de prueba',
      );
    });

    it('la 4242 aprueba: la cuota queda Pagada y el residente recibe el aviso', async () => {
      const { body } = await api(app, residente3)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card())
        .expect(201);
      approvedPaymentId = body.id;
      expect(body).toMatchObject({
        status: 'APROBADO',
        failureReason: null,
        amount: 45,
        cardLast4: '4242',
        fee: { id: pendingId, status: 'PAGADO' },
      });

      const fee = await db(app).fee.findUniqueOrThrow({
        where: { id: pendingId },
      });
      expect(fee.status).toBe('PAGADO');
      expect(fee.paidAt).not.toBeNull();

      const [notification] = await inbox(app, residente3);
      expect(notification).toMatchObject({
        title: 'Pago aprobado',
        referenceId: body.id,
      });
      expect(notification.message).toBe(
        `Tu pago de $45.00 de la cuota ${period} fue aprobado. Transacción ${body.transactionNumber}.`,
      );
    });

    it('solo guarda los últimos 4 dígitos y el titular', async () => {
      const rows = await db(app).payment.findMany({
        where: { feeId: pendingId },
      });
      const stored = JSON.stringify(rows);
      expect(stored).not.toContain('4242424242424242');
      expect(stored).not.toContain('123');
      expect(rows.every((row) => /^\d{4}$/.test(row.cardLast4))).toBe(true);
    });

    it('una cuota Pagada no se cobra otra vez (409)', async () => {
      const { body } = await api(app, residente3)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card())
        .expect(409);
      expect(body.message).toBe('Esta cuota ya está pagada.');
    });

    it('dos pagos simultáneos de la misma cuota: uno solo aprobado', async () => {
      const overdueId = (await payableFee('B-203')).id;
      const results = await Promise.all([
        api(app, residente5).post(`cuotas/${overdueId}/pagos`).send(card()),
        api(app, residente5).post(`cuotas/${overdueId}/pagos`).send(card()),
      ]);
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409,
      ]);
      const approved = await db(app).payment.count({
        where: { feeId: overdueId, status: 'APROBADO' },
      });
      expect(approved).toBe(1);
    });

    it('la misma llave de idempotencia devuelve el mismo pago sin cobrar (200)', async () => {
      const feeId = (await payableFee('B-203')).id;
      const body = card();
      const first = await api(app, residente5)
        .post(`cuotas/${feeId}/pagos`)
        .send(body)
        .expect(201);
      const again = await api(app, residente5)
        .post(`cuotas/${feeId}/pagos`)
        .send(body)
        .expect(200);
      expect(again.body.id).toBe(first.body.id);
      expect(
        await db(app).payment.count({
          where: { idempotencyKey: body.idempotencyKey },
        }),
      ).toBe(1);
    });

    it('el recibo lo ven el residente de la unidad y el Administrador', async () => {
      const { body } = await api(app, residente3)
        .get(`pagos/${approvedPaymentId}`)
        .expect(200);
      expect(body).toMatchObject({
        id: approvedPaymentId,
        status: 'APROBADO',
        holderName: 'Ana Lopez',
        cardLast4: '4242',
        unit: { code: 'A-102' },
        fee: { id: pendingId, period, status: 'PAGADO' },
      });
      await api(app, admin).get(`pagos/${approvedPaymentId}`).expect(200);
      await api(app, residente1).get(`pagos/${approvedPaymentId}`).expect(404);
    });

    it('Administrador y Seguridad no usan el endpoint de pago (403)', async () => {
      await api(app, admin)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card())
        .expect(403);
      await api(app, seguridad)
        .post(`cuotas/${pendingId}/pagos`)
        .send(card())
        .expect(403);
    });

    it('H2: el detalle de la cuota lista sus pagos, del más reciente al más antiguo', async () => {
      const { body } = await api(app, residente3)
        .get(`cuotas/${pendingId}/pagos`)
        .expect(200);
      expect(body.data.map((p: { status: string }) => p.status)).toEqual([
        'APROBADO',
        'RECHAZADO',
        'RECHAZADO',
      ]);
      expect(body.data[2]).toMatchObject({
        failureReason: 'Fondos insuficientes',
        cardLast4: '0002',
      });
      await api(app, admin).get(`cuotas/${pendingId}/pagos`).expect(200);
      await api(app, residente1).get(`cuotas/${pendingId}/pagos`).expect(404);
    });

    it('H2: el saldo pendiente baja después del pago', async () => {
      const body = await statement(residente3);
      expect(body.summary).toEqual(await expectedSummary('A-102'));
      expect(body.data.find((fee) => fee.id === pendingId)?.status).toBe(
        'PAGADO',
      );
    });
  });

  describe('H2: unidad (administración)', () => {
    let unitId: string;
    let oldCode: string;

    beforeAll(async () => {
      const unit = await db(app).unit.findUniqueOrThrow({
        where: { code: 'B-203' },
      });
      unitId = unit.id;
      oldCode = unit.registrationCode;
    });

    it('el Administrador ve el estado de cuenta, el código y los residentes', async () => {
      const { body: account } = await api(app, admin)
        .get(`unidades/${unitId}/estado-cuenta`)
        .expect(200);
      expect(account.unit.code).toBe('B-203');

      const { body } = await api(app, admin)
        .get(`admin/unidades/${unitId}`)
        .expect(200);
      expect(body).toMatchObject({
        id: unitId,
        code: 'B-203',
        registrationCode: oldCode,
      });
      expect(body.tower).toHaveProperty('name');
      expect(body.residents.length).toBeGreaterThan(0);
      expect(body.residents.length).toBeLessThanOrEqual(4);
    });

    it('regenerar crea otro código y el anterior deja de servir para registrarse', async () => {
      const { body } = await api(app, admin)
        .post(`admin/unidades/${unitId}/codigo-registro`)
        .expect(201);
      expect(body.registrationCode).toMatch(
        /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/,
      );
      expect(body.registrationCode).not.toBe(oldCode);

      const unit = await db(app).unit.findUniqueOrThrow({
        where: { id: unitId },
      });
      expect(unit.registrationCodeUpdatedAt).not.toBeNull();
      expect(unit.registrationCodeUpdatedById).not.toBeNull();

      const { body: res } = await api(app)
        .post('auth/registro')
        .send({
          fullName: 'Nueva Residente',
          email: 'nueva.h2@condominio.test',
          phone: '7000-1111',
          unitCode: oldCode,
          password: 'Prueba2026',
        })
        .expect(404);
      expect(res.message).toBe('El código de unidad no existe.');

      // Devuelve el código original para no afectar a los demás flujos.
      await db(app).unit.update({
        where: { id: unitId },
        data: { registrationCode: oldCode },
      });
    });

    it('una unidad inexistente responde 404', async () => {
      await api(app, admin).get(`admin/unidades/${randomUUID()}`).expect(404);
      await api(app, admin)
        .get(`unidades/${randomUUID()}/estado-cuenta`)
        .expect(404);
      await api(app, admin)
        .post(`admin/unidades/${randomUUID()}/codigo-registro`)
        .expect(404);
    });

    it('Residente y Seguridad no ven ni regeneran códigos (403)', async () => {
      await api(app, residente5).get(`admin/unidades/${unitId}`).expect(403);
      await api(app, seguridad)
        .post(`admin/unidades/${unitId}/codigo-registro`)
        .expect(403);
    });
  });
});
