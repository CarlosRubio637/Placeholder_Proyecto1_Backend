/**
 * Datos base del condominio (H39): torres, unidades, cuentas de prueba,
 * responsables de mantenimiento, áreas comunes y cuotas de los 2 meses
 * anteriores. Cada función recibe el cliente de Prisma para poder probarla
 * con uno simulado (seed-condominio.spec.ts); prisma/seed.ts las corre en
 * orden con el cliente real.
 */
import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  addMonths,
  currentPeriod,
  defaultConcept,
} from '../src/fees/billing-period/billing-period.js';
import {
  addDays,
  todayIso,
  toDbDate,
} from '../src/common/time/condominium-time.js';

/** Cliente que usa el seed: el real en prisma/seed.ts, uno simulado en las pruebas. */
export type SeedClient = PrismaClient;

// --- H39: torres y unidades --------------------------------------------------

export const TOWER_LETTERS = ['A', 'B', 'C'];
export const FLOORS = 4;
export const UNITS_PER_FLOOR = 4;

// Sin caracteres ambiguos (I, L, O, 0, 1) para que el residente no se
// equivoque al copiar el código de registro.
export const REGISTRATION_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function registrationCode(): string {
  return Array.from(
    { length: 8 },
    () => REGISTRATION_ALPHABET[randomInt(REGISTRATION_ALPHABET.length)],
  ).join('');
}

/**
 * 3 torres (A, B, C) con 4 pisos de 4 unidades: 101..104, 201..204, etc.
 * Idempotente: al repetirlo no duplica nada ni cambia los códigos de registro
 * ya entregados (`update: {}`).
 */
export async function seedTowersAndUnits(db: SeedClient) {
  for (const letter of TOWER_LETTERS) {
    const tower = await db.tower.upsert({
      where: { letter },
      update: {},
      create: { letter, name: `Torre ${letter}` },
    });

    for (let floor = 1; floor <= FLOORS; floor++) {
      for (let n = 1; n <= UNITS_PER_FLOOR; n++) {
        const number = `${floor}0${n}`;
        const code = `${letter}-${number}`;
        await db.unit.upsert({
          where: { code },
          update: {},
          create: {
            towerId: tower.id,
            number,
            code,
            registrationCode: registrationCode(),
          },
        });
      }
    }
  }

  const [towers, units] = await Promise.all([
    db.tower.count(),
    db.unit.count(),
  ]);
  console.log(`Torres y unidades listas: ${towers} torres, ${units} unidades`);
}

// --- H39 parte 2: cuentas de prueba, responsables y áreas --------------------

/**
 * Igual que toSearchName de src/users/services/users.service.ts (el seed corre
 * con tsx fuera de Nest y no importa servicios): minúsculas, sin tildes y con
 * los espacios normalizados. Se usa para Profile.searchName y CommonArea.nameKey.
 */
export function toSearchName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type TestAccount = {
  email: string;
  role: 'ADMINISTRADOR' | 'SEGURIDAD' | 'RESIDENTE';
  fullName: string;
  phone: string;
  /** Código de la unidad; obligatorio para RESIDENTE. */
  unitCode?: string;
};

/**
 * 1 administrador, 2 de seguridad y 6 residentes (2 en A-101; 1 en A-102,
 * B-101, B-203 y C-304). Los correos tienen de 21 a 26 caracteres y cumplen
 * las validaciones del registro (H38).
 */
export const TEST_ACCOUNTS: TestAccount[] = [
  {
    email: 'admin@condominio.test',
    role: 'ADMINISTRADOR',
    fullName: 'Laura Martínez',
    phone: '2250-1000',
  },
  {
    email: 'seguridad1@condominio.test',
    role: 'SEGURIDAD',
    fullName: 'Mario Rivas',
    phone: '7000-2001',
  },
  {
    email: 'seguridad2@condominio.test',
    role: 'SEGURIDAD',
    fullName: 'José Hernández',
    phone: '7000-2002',
  },
  {
    email: 'residente1@condominio.test',
    role: 'RESIDENTE',
    fullName: 'Ana Gómez',
    phone: '7100-0001',
    unitCode: 'A-101',
  },
  {
    email: 'residente2@condominio.test',
    role: 'RESIDENTE',
    fullName: 'Luis Gómez',
    phone: '7100-0002',
    unitCode: 'A-101',
  },
  {
    email: 'residente3@condominio.test',
    role: 'RESIDENTE',
    fullName: 'Carmen Flores',
    phone: '7100-0003',
    unitCode: 'A-102',
  },
  {
    email: 'residente4@condominio.test',
    role: 'RESIDENTE',
    fullName: 'Roberto Díaz',
    phone: '7100-0004',
    unitCode: 'B-101',
  },
  {
    email: 'residente5@condominio.test',
    role: 'RESIDENTE',
    fullName: 'Sofía Castillo',
    phone: '7100-0005',
    unitCode: 'B-203',
  },
  {
    email: 'residente6@condominio.test',
    role: 'RESIDENTE',
    fullName: 'Daniel Ramos',
    phone: '7100-0006',
    unitCode: 'C-304',
  },
];

/**
 * Cuentas de prueba con su perfil. Idempotente: upsert por correo y por
 * userId con `update: {}`, así no pisa cambios que el equipo haya hecho al
 * probar (contraseña, nombre…).
 */
export async function seedTestAccounts(db: SeedClient, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);

  for (const account of TEST_ACCOUNTS) {
    let unitId: string | null = null;
    if (account.role === 'RESIDENTE') {
      // Nunca un residente sin unidad (también lo impide un CHECK de H38).
      if (!account.unitCode) {
        throw new Error(`El residente ${account.email} no tiene unidad.`);
      }
      const unit = await db.unit.findUnique({
        where: { code: account.unitCode },
      });
      if (!unit) {
        throw new Error(
          `No existe la unidad ${account.unitCode} (${account.email}).`,
        );
      }
      unitId = unit.id;
    }

    const user = await db.user.upsert({
      where: { email: account.email },
      update: {},
      create: {
        email: account.email,
        passwordHash,
        role: account.role,
        unitId,
      },
    });
    await db.profile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        fullName: account.fullName,
        searchName: toSearchName(account.fullName),
        phone: account.phone,
      },
    });
  }

  console.log(`Cuentas de prueba listas: ${TEST_ACCOUNTS.length}`);
}

/** Responsables de mantenimiento (H12): catálogo sin acceso al sistema. */
export const MAINTENANCE_STAFF = [
  { name: 'Pedro Alvarado', specialty: 'Fontanería', phone: '7200-0001' },
  { name: 'Miguel Torres', specialty: 'Electricidad', phone: '7200-0002' },
  {
    name: 'Rosa Méndez',
    specialty: 'Mantenimiento general',
    phone: '7200-0003',
  },
];

/** Idempotente por nombre (MaintenanceStaff no tiene otra llave natural). */
export async function seedMaintenanceStaff(db: SeedClient) {
  for (const staff of MAINTENANCE_STAFF) {
    const existing = await db.maintenanceStaff.findFirst({
      where: { name: staff.name },
    });
    if (!existing) {
      await db.maintenanceStaff.create({ data: staff });
    }
  }
  console.log(
    `Responsables de mantenimiento listos: ${MAINTENANCE_STAFF.length}`,
  );
}

/**
 * Áreas comunes (H9). Horarios en pasos de 30 minutos, franjas de 60 o 120
 * minutos y aforo de 1 a 500, como exigen los CHECK de H9.
 */
export const COMMON_AREAS = [
  {
    name: 'Salón de eventos',
    capacity: 80,
    openTime: '08:00',
    closeTime: '22:00',
    slotMinutes: 120,
    rules:
      'Reservar con anticipación. Dejar el salón limpio y sin decoraciones pegadas en las paredes.',
  },
  {
    name: 'Piscina',
    capacity: 30,
    openTime: '07:00',
    closeTime: '19:00',
    slotMinutes: 60,
    rules:
      'Ducharse antes de entrar. Menores de 12 años con un adulto. Prohibido el vidrio.',
  },
  {
    name: 'Gimnasio',
    capacity: 15,
    openTime: '05:00',
    closeTime: '22:00',
    slotMinutes: 60,
    rules: 'Usar toalla y limpiar los equipos después de usarlos.',
  },
  {
    name: 'Asador',
    capacity: 20,
    openTime: '10:00',
    closeTime: '22:00',
    slotMinutes: 120,
    rules:
      'Traer su propio carbón. Apagar el fuego y limpiar la parrilla al terminar.',
  },
];

/** Idempotente por nameKey; `update: {}` respeta los cambios de la administración. */
export async function seedCommonAreas(db: SeedClient) {
  for (const area of COMMON_AREAS) {
    const nameKey = toSearchName(area.name);
    await db.commonArea.upsert({
      where: { nameKey },
      update: {},
      create: { ...area, nameKey },
    });
  }
  console.log(`Áreas comunes listas: ${COMMON_AREAS.length}`);
}

// --- H39: cuotas de los 2 meses anteriores (Módulo 1) ------------------------

export const FEE_AMOUNT = '45.00';
export const FEE_DUE_DAY = '10'; // Vencimiento por defecto de H3.
export const OVERDUE_AFTER_DAYS = 30; // H5: Moroso cuando venció hace más de 30 días.
export const REMINDER_DAYS_BEFORE = 5; // H5: recordatorio 5 días antes del vencimiento.

/**
 * Qué pagó cada unidad: [mes anterior a ese, mes anterior]. Las que no
 * aparecen (unidades que el equipo haya ocupado al probar) quedan pagadas.
 * Deja datos para el estado de cuenta (H2), la morosidad (H4, H32) y H5:
 * las cuotas sin pagar del penúltimo mes ya están en Moroso y las del último
 * mes siguen Pendientes hasta que se cumplan los 30 días.
 */
export const FEE_PAYMENTS: Record<string, [boolean, boolean]> = {
  'A-101': [true, true],
  'A-102': [true, false],
  'B-101': [true, true],
  'B-203': [false, false],
  'C-304': [false, false],
};

/** Fecha y hora de El Salvador (UTC-6, sin horario de verano) → Date. */
export function svDateTime(isoDate: string, time: string): Date {
  return new Date(`${isoDate}T${time}:00-06:00`);
}

/**
 * Genera las cuotas de los 2 meses anteriores como lo haría la
 * administración con H3 (una generación por periodo, solo unidades con algún
 * residente activo) y les da el estado que tendrían hoy según H5.
 * Idempotente: si el periodo ya tiene una generación no lo toca, así no pisa
 * pagos ni cambios hechos al probar.
 */
export async function seedFees(db: SeedClient, now: Date = new Date()) {
  const admin = await db.user.findUniqueOrThrow({
    where: { email: 'admin@condominio.test' },
  });
  const today = todayIso(now);
  const thisPeriod = currentPeriod(today);
  const units = await db.unit.findMany({
    where: { residents: { some: { role: 'RESIDENTE', isActive: true } } },
    select: { id: true, code: true },
    orderBy: { code: 'asc' },
  });

  for (const [index, monthsBack] of [2, 1].entries()) {
    const period = addMonths(thisPeriod, -monthsBack);
    const exists = await db.feeGeneration.findFirst({ where: { period } });
    if (exists) {
      console.log(`Cuotas de ${period}: ya generadas, sin cambios`);
      continue;
    }

    const dueIso = `${period}-${FEE_DUE_DAY}`;
    const concept = defaultConcept(period);
    // H3 solo permite generar desde el mes del periodo: el día 1 a las 9:00.
    const generatedAt = svDateTime(`${period}-01`, '09:00');
    const overdueIso = addDays(dueIso, OVERDUE_AFTER_DAYS + 1);
    const reminderAt = svDateTime(
      addDays(dueIso, -REMINDER_DAYS_BEFORE),
      '08:00',
    );

    const fees = units.map((unit) => {
      const paid = FEE_PAYMENTS[unit.code]?.[index] ?? true;
      if (paid) {
        // Pagó antes del recordatorio: no tiene reminderSentAt.
        return {
          unitId: unit.id,
          status: 'PAGADO' as const,
          paidAt: svDateTime(`${period}-03`, '10:30'),
        };
      }
      const overdue = overdueIso <= today;
      return {
        unitId: unit.id,
        status: overdue ? ('MOROSO' as const) : ('PENDIENTE' as const),
        // H5 la pasa a Moroso a las 00:05 del día 31 después del vencimiento.
        overdueAt: overdue ? svDateTime(overdueIso, '00:05') : null,
        reminderSentAt: reminderAt <= now ? reminderAt : null,
      };
    });

    await db.$transaction(async (tx) => {
      const generation = await tx.feeGeneration.create({
        data: {
          period,
          amount: FEE_AMOUNT,
          dueDate: toDbDate(dueIso),
          concept,
          createdCount: 0,
          skippedCount: 0,
          createdById: admin.id,
          createdAt: generatedAt,
        },
      });
      const { count } = await tx.fee.createMany({
        data: fees.map((fee) => ({
          ...fee,
          generationId: generation.id,
          period,
          concept,
          amount: FEE_AMOUNT,
          dueDate: toDbDate(dueIso),
          createdAt: generatedAt,
        })),
        skipDuplicates: true,
      });
      await tx.feeGeneration.update({
        where: { id: generation.id },
        data: { createdCount: count, skippedCount: units.length - count },
      });
    });

    const summary = fees.reduce<Record<string, number>>((acc, fee) => {
      acc[fee.status] = (acc[fee.status] ?? 0) + 1;
      return acc;
    }, {});
    console.log(
      `Cuotas de ${period}: ${fees.length} (${JSON.stringify(summary)})`,
    );
  }
}
