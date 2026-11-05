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

try {
  await main();
} finally {
  await prisma.$disconnect();
}
