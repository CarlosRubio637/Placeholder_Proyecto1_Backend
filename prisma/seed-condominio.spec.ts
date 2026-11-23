import bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegistroDto } from '../src/auth/dto/registro.dto.js';
import {
  COMMON_AREAS,
  MAINTENANCE_STAFF,
  TEST_ACCOUNTS,
  registrationCode,
  seedCommonAreas,
  seedFees,
  seedMaintenanceStaff,
  seedTestAccounts,
  seedTowersAndUnits,
  type SeedClient,
} from './seed-condominio.js';

const PASSWORD = 'Prueba2026';
const ROLES = ['ADMINISTRADOR', 'SEGURIDAD', 'RESIDENTE'];

type Row = Record<string, unknown> & { id: string };

/**
 * Base en memoria con las operaciones que usa el seed. `upsert` respeta el
 * `update` (el seed manda `{}`), así que correrlo dos veces muestra si duplica.
 */
function fakeDb() {
  let next = 0;
  const tables: Record<string, Row[]> = {
    tower: [],
    unit: [],
    user: [],
    profile: [],
    maintenanceStaff: [],
    commonArea: [],
    feeGeneration: [],
    fee: [],
  };
  const creates: Record<string, number> = {};
  const id = () => `id-${++next}`;
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => row[k] === v);

  function model(name: string) {
    const rows = () => tables[name];
    const insert = (data: Record<string, unknown>) => {
      creates[name] = (creates[name] ?? 0) + 1;
      const row = { id: id(), ...data } as Row;
      rows().push(row);
      return row;
    };
    return {
      upsert: vi.fn(
        ({
          where,
          update,
          create,
        }: {
          where: Record<string, unknown>;
          update: object;
          create: Record<string, unknown>;
        }) => {
          const found = rows().find((r) => matches(r, where));
          if (found) return Promise.resolve(Object.assign(found, update));
          return Promise.resolve(insert(create));
        },
      ),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(insert(data)),
      ),
      createMany: vi.fn(({ data }: { data: Record<string, unknown>[] }) => {
        let count = 0;
        for (const d of data) {
          const dup = rows().some(
            (r) => r.unitId === d.unitId && r.period === d.period,
          );
          if (!dup) {
            insert(d);
            count++;
          }
        }
        return Promise.resolve({ count });
      }),
      update: vi.fn(
        ({ where, data }: { where: Record<string, unknown>; data: object }) =>
          Promise.resolve(
            Object.assign(
              rows().find((r) => matches(r, where))!,
              data,
            ),
          ),
      ),
      findUnique: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows().find((r) => matches(r, where)) ?? null),
      ),
      findUniqueOrThrow: vi.fn(
        ({ where }: { where: Record<string, unknown> }) => {
          const found = rows().find((r) => matches(r, where));
          return found
            ? Promise.resolve(found)
            : Promise.reject(new Error(`${name} no encontrado`));
        },
      ),
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(rows().find((r) => matches(r, where)) ?? null),
      ),
      findMany: vi.fn((): Promise<unknown[]> => Promise.resolve(rows())),
      count: vi.fn(() => Promise.resolve(rows().length)),
    };
  }

  const db = Object.fromEntries(
    Object.keys(tables).map((name) => [name, model(name)]),
  ) as Record<string, ReturnType<typeof model>>;
  // seedFees: unidades con al menos un residente activo, por código.
  db.unit.findMany = vi.fn(() =>
    Promise.resolve(
      tables.unit
        .filter((u) =>
          tables.user.some((r) => r.unitId === u.id && r.role === 'RESIDENTE'),
        )
        .map((u) => ({ id: u.id, code: u.code }))
        .sort((a, b) => String(a.code).localeCompare(String(b.code))),
    ),
  );
  const client = {
    ...db,
    $transaction: vi.fn((fn: (tx: typeof db) => unknown) => fn(db)),
  } as unknown as SeedClient;
  return { client, tables, creates, db };
}

async function seedAll(client: SeedClient, now: Date) {
  await seedTowersAndUnits(client);
  await seedTestAccounts(client, PASSWORD);
  await seedMaintenanceStaff(client);
  await seedCommonAreas(client);
  await seedFees(client, now);
}

/** 5 de noviembre de 2026, 10:00 en El Salvador: la cuota de octubre todavía no cumple 30 días de vencida. */
const NOW = new Date('2026-11-05T10:00:00-06:00');

describe('H39. Script de datos iniciales del condominio', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('AC1: crea las 3 torres (A, B y C) y 48 unidades, 4 pisos de 4 unidades por torre', async () => {
    const { client, tables } = fakeDb();
    await seedTowersAndUnits(client);

    expect(tables.tower.map((t) => [t.letter, t.name])).toEqual([
      ['A', 'Torre A'],
      ['B', 'Torre B'],
      ['C', 'Torre C'],
    ]);
    expect(tables.unit).toHaveLength(48);
    for (const tower of tables.tower) {
      const numbers = tables.unit
        .filter((u) => u.towerId === tower.id)
        .map((u) => u.number);
      expect(numbers).toEqual([
        '101',
        '102',
        '103',
        '104',
        '201',
        '202',
        '203',
        '204',
        '301',
        '302',
        '303',
        '304',
        '401',
        '402',
        '403',
        '404',
      ]);
    }
  });

  it('AC1: cada unidad tiene código <letra>-<número> único y un código de registro de 8 caracteres', async () => {
    const { client, tables } = fakeDb();
    await seedTowersAndUnits(client);

    const codes = tables.unit.map((u) => u.code as string);
    expect(new Set(codes).size).toBe(48);
    expect(codes).toContain('A-101');
    expect(codes).toContain('C-404');
    for (const unit of tables.unit) {
      const tower = tables.tower.find((t) => t.id === unit.towerId)!;
      expect(unit.code).toBe(
        `${tower.letter as string}-${unit.number as string}`,
      );
      expect(unit.registrationCode).toMatch(/^[A-Z0-9]{8}$/);
    }
    // Sin caracteres ambiguos para copiarlo a mano.
    expect(registrationCode()).not.toMatch(/[ILO01]/);
  });

  it('AC2: crea 1 Administrador, 2 de seguridad y 6 residentes con sus correos y unidades', async () => {
    const { client, tables } = fakeDb();
    await seedTowersAndUnits(client);
    await seedTestAccounts(client, PASSWORD);

    const unitCode = (unitId: unknown) =>
      tables.unit.find((u) => u.id === unitId)?.code ?? null;
    expect(
      tables.user.map((u) => [u.email, u.role, unitCode(u.unitId)]),
    ).toEqual([
      ['admin@condominio.test', 'ADMINISTRADOR', null],
      ['seguridad1@condominio.test', 'SEGURIDAD', null],
      ['seguridad2@condominio.test', 'SEGURIDAD', null],
      ['residente1@condominio.test', 'RESIDENTE', 'A-101'],
      ['residente2@condominio.test', 'RESIDENTE', 'A-101'],
      ['residente3@condominio.test', 'RESIDENTE', 'A-102'],
      ['residente4@condominio.test', 'RESIDENTE', 'B-101'],
      ['residente5@condominio.test', 'RESIDENTE', 'B-203'],
      ['residente6@condominio.test', 'RESIDENTE', 'C-304'],
    ]);
    expect(tables.profile).toHaveLength(9);
  });

  it('AC2: todas las cuentas tienen la contraseña Prueba2026, con bcrypt de 12 rondas', async () => {
    const { client, tables } = fakeDb();
    await seedTowersAndUnits(client);
    await seedTestAccounts(client, PASSWORD);

    const hashes = new Set(tables.user.map((u) => u.passwordHash as string));
    expect(hashes.size).toBe(1);
    const [hash] = hashes;
    expect(bcrypt.getRounds(hash)).toBe(12);
    await expect(bcrypt.compare(PASSWORD, hash)).resolves.toBe(true);
  });

  it('AC3: crea las 4 áreas comunes y los 3 responsables de mantenimiento', async () => {
    const { client, tables } = fakeDb();
    await seedMaintenanceStaff(client);
    await seedCommonAreas(client);

    expect(tables.commonArea.map((a) => a.name)).toEqual([
      'Salón de eventos',
      'Piscina',
      'Gimnasio',
      'Asador',
    ]);
    expect(tables.maintenanceStaff.map((s) => [s.name, s.specialty])).toEqual(
      MAINTENANCE_STAFF.map((s) => [s.name, s.specialty]),
    );
  });

  it('AC3: crea las cuotas de los 2 meses anteriores para las unidades con residentes', async () => {
    const { client, tables } = fakeDb();
    await seedAll(client, NOW);

    expect(tables.feeGeneration.map((g) => g.period)).toEqual([
      '2026-09',
      '2026-10',
    ]);
    const byPeriod = (period: string) =>
      tables.fee
        .filter((f) => f.period === period)
        .map((f) => [
          tables.unit.find((u) => u.id === f.unitId)!.code,
          f.status,
        ]);
    // Unidades con residentes: A-101, A-102, B-101, B-203 y C-304.
    expect(byPeriod('2026-09')).toEqual([
      ['A-101', 'PAGADO'],
      ['A-102', 'PAGADO'],
      ['B-101', 'PAGADO'],
      ['B-203', 'MOROSO'],
      ['C-304', 'MOROSO'],
    ]);
    expect(byPeriod('2026-10')).toEqual([
      ['A-101', 'PAGADO'],
      ['A-102', 'PENDIENTE'],
      ['B-101', 'PAGADO'],
      ['B-203', 'PENDIENTE'],
      ['C-304', 'PENDIENTE'],
    ]);
    expect(tables.feeGeneration.map((g) => g.createdCount)).toEqual([5, 5]);
  });

  it.each(TEST_ACCOUNTS.map((a) => [a.email, a] as const))(
    'AC4: %s cumple las validaciones del registro',
    async (_email, account) => {
      expect(account.email.length).toBeGreaterThanOrEqual(21);
      expect(account.email.length).toBeLessThanOrEqual(26);
      const dto = plainToInstance(RegistroDto, {
        fullName: account.fullName,
        email: account.email,
        phone: account.phone,
        unitCode: registrationCode(),
        password: PASSWORD,
      });
      await expect(validate(dto)).resolves.toEqual([]);
    },
  );

  it('AC4: las áreas comunes cumplen los horarios en pasos de 30 minutos y el aforo de H9', () => {
    for (const area of COMMON_AREAS) {
      expect(area.openTime).toMatch(/^\d\d:(00|30)$/);
      expect(area.closeTime).toMatch(/^\d\d:(00|30)$/);
      expect([60, 120]).toContain(area.slotMinutes);
      expect(area.capacity).toBeGreaterThanOrEqual(1);
      expect(area.capacity).toBeLessThanOrEqual(500);
    }
  });

  it('AC5: correrlo dos veces no duplica datos', async () => {
    const { client, tables } = fakeDb();
    await seedAll(client, NOW);
    const first = Object.fromEntries(
      Object.entries(tables).map(([t, rows]) => [t, rows.length]),
    );

    await seedAll(client, NOW);

    expect(
      Object.fromEntries(
        Object.entries(tables).map(([t, rows]) => [t, rows.length]),
      ),
    ).toEqual(first);
    expect(first).toEqual({
      tower: 3,
      unit: 48,
      user: 9,
      profile: 9,
      maintenanceStaff: 3,
      commonArea: 4,
      feeGeneration: 2,
      fee: 10,
    });
  });

  it('AC5: usa upsert por letra, código, correo y nameKey sin pisar lo existente', async () => {
    const { client, db } = fakeDb();
    await seedAll(client, NOW);

    expect(db.tower.upsert.mock.calls[0][0]).toMatchObject({
      where: { letter: 'A' },
      update: {},
    });
    expect(db.unit.upsert.mock.calls[0][0]).toMatchObject({
      where: { code: 'A-101' },
      update: {},
    });
    expect(db.user.upsert.mock.calls[0][0]).toMatchObject({
      where: { email: 'admin@condominio.test' },
      update: {},
    });
    expect(db.commonArea.upsert.mock.calls[0][0]).toMatchObject({
      where: { nameKey: 'salon de eventos' },
      update: {},
    });
  });

  it('AC6: no crea cuentas con un rol distinto de los tres definidos', async () => {
    const { client, tables } = fakeDb();
    await seedTowersAndUnits(client);
    await seedTestAccounts(client, PASSWORD);

    for (const user of tables.user) expect(ROLES).toContain(user.role);
  });

  it('AC6: no crea residentes sin unidad: todos tienen una unidad existente', async () => {
    const { client, tables } = fakeDb();
    await seedTowersAndUnits(client);
    await seedTestAccounts(client, PASSWORD);

    const residents = tables.user.filter((u) => u.role === 'RESIDENTE');
    expect(residents).toHaveLength(6);
    for (const resident of residents) {
      expect(tables.unit.some((u) => u.id === resident.unitId)).toBe(true);
    }
    // Los demás roles no tienen unidad.
    for (const user of tables.user.filter((u) => u.role !== 'RESIDENTE')) {
      expect(user.unitId).toBeNull();
    }
  });

  it('AC6: si la unidad de un residente no existe, se detiene antes de crearlo', async () => {
    const { client, tables } = fakeDb();
    // Sin torres ni unidades: la primera cuenta de residente no tiene a dónde ir.
    await expect(seedTestAccounts(client, PASSWORD)).rejects.toThrow(
      'No existe la unidad A-101 (residente1@condominio.test).',
    );
    expect(tables.user.some((u) => u.role === 'RESIDENTE')).toBe(false);
  });
});
