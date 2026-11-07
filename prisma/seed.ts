import 'dotenv/config';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Demo1234!';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // `upsert` hace el seed idempotente: se puede correr las veces que haga falta.
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash, role: 'ADMINISTRADOR' },
  });

  console.log(`Usuario demo listo: ${user.email} / ${DEMO_PASSWORD}`);

  await seedTowersAndUnits();
  await seedTestAccounts();
  await seedMaintenanceStaff();
  await seedCommonAreas();
}

// --- H39: torres y unidades --------------------------------------------------

const TOWER_LETTERS = ['A', 'B', 'C'];
const FLOORS = 4;
const UNITS_PER_FLOOR = 4;

// Sin caracteres ambiguos (I, L, O, 0, 1) para que el residente no se
// equivoque al copiar el código de registro.
const REGISTRATION_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function registrationCode(): string {
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
async function seedTowersAndUnits() {
  for (const letter of TOWER_LETTERS) {
    const tower = await prisma.tower.upsert({
      where: { letter },
      update: {},
      create: { letter, name: `Torre ${letter}` },
    });

    for (let floor = 1; floor <= FLOORS; floor++) {
      for (let n = 1; n <= UNITS_PER_FLOOR; n++) {
        const number = `${floor}0${n}`;
        const code = `${letter}-${number}`;
        await prisma.unit.upsert({
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
    prisma.tower.count(),
    prisma.unit.count(),
  ]);
  console.log(`Torres y unidades listas: ${towers} torres, ${units} unidades`);
}

// --- H39 parte 2: cuentas de prueba, responsables y áreas --------------------

/** Contraseña de todas las cuentas de prueba (H39). */
const TEST_PASSWORD = 'Prueba2026';

/**
 * Igual que toSearchName de src/users/services/users.service.ts (el seed corre
 * con tsx fuera de Nest y no importa servicios): minúsculas, sin tildes y con
 * los espacios normalizados. Se usa para Profile.searchName y CommonArea.nameKey.
 */
function toSearchName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

type TestAccount = {
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
const TEST_ACCOUNTS: TestAccount[] = [
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
async function seedTestAccounts() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  for (const account of TEST_ACCOUNTS) {
    let unitId: string | null = null;
    if (account.role === 'RESIDENTE') {
      // Nunca un residente sin unidad (también lo impide un CHECK de H38).
      if (!account.unitCode) {
        throw new Error(`El residente ${account.email} no tiene unidad.`);
      }
      const unit = await prisma.unit.findUnique({
        where: { code: account.unitCode },
      });
      if (!unit) {
        throw new Error(
          `No existe la unidad ${account.unitCode} (${account.email}).`,
        );
      }
      unitId = unit.id;
    }

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: {
        email: account.email,
        passwordHash,
        role: account.role,
        unitId,
      },
    });
    await prisma.profile.upsert({
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

  console.log(
    `Cuentas de prueba listas: ${TEST_ACCOUNTS.length} (contraseña ${TEST_PASSWORD})`,
  );
}

/** Responsables de mantenimiento (H12): catálogo sin acceso al sistema. */
const MAINTENANCE_STAFF = [
  { name: 'Pedro Alvarado', specialty: 'Fontanería', phone: '7200-0001' },
  { name: 'Miguel Torres', specialty: 'Electricidad', phone: '7200-0002' },
  {
    name: 'Rosa Méndez',
    specialty: 'Mantenimiento general',
    phone: '7200-0003',
  },
];

/** Idempotente por nombre (MaintenanceStaff no tiene otra llave natural). */
async function seedMaintenanceStaff() {
  for (const staff of MAINTENANCE_STAFF) {
    const existing = await prisma.maintenanceStaff.findFirst({
      where: { name: staff.name },
    });
    if (!existing) {
      await prisma.maintenanceStaff.create({ data: staff });
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
const COMMON_AREAS = [
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
async function seedCommonAreas() {
  for (const area of COMMON_AREAS) {
    const nameKey = toSearchName(area.name);
    await prisma.commonArea.upsert({
      where: { nameKey },
      update: {},
      create: { ...area, nameKey },
    });
  }
  console.log(`Áreas comunes listas: ${COMMON_AREAS.length}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
