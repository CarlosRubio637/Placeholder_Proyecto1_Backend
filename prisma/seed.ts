import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
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
import {
  FEE_AMOUNT,
  FEE_DUE_DAY,
  seedCommonAreas,
  seedFees,
  seedMaintenanceStaff,
  seedTestAccounts,
  seedTowersAndUnits,
  svDateTime,
} from './seed-condominio.js';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = requiredEnv('SEED_DEMO_PASSWORD');
/** Contraseña de todas las cuentas de prueba (H39). */
const TEST_PASSWORD = requiredEnv('SEED_TEST_PASSWORD');

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta ${name} en el entorno: el seed no crea cuentas sin contraseña (ver .env.example).`,
    );
  }
  return value;
}

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

  console.log(`Usuario demo listo: ${user.email}`);

  await seedTowersAndUnits(prisma);
  await seedTestAccounts(prisma, TEST_PASSWORD);
  await seedMaintenanceStaff(prisma);
  await seedCommonAreas(prisma);
  await seedFees(prisma);
  if (process.env.NODE_ENV !== 'test') await seedFeeTasksScenario();
  if (process.env.NODE_ENV !== 'test') await seedAnnouncementsScenario();
  if (process.env.NODE_ENV !== 'test') await seedDirectoryScenario();
}

const FEE_TASKS_SCENARIO_EMAIL = 'residente5@condominio.test';
const FEE_TASKS_SCENARIO_MONTHS_BACK = 3;
const FEE_TASKS_SCENARIO_DAYS_TO_DUE = 3;

async function seedFeeTasksScenario() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@condominio.test' },
  });
  const { unitId } = await prisma.user.findUniqueOrThrow({
    where: { email: FEE_TASKS_SCENARIO_EMAIL },
    select: { unitId: true },
  });
  if (!unitId) {
    throw new Error(`${FEE_TASKS_SCENARIO_EMAIL} no tiene unidad asignada`);
  }

  const today = todayIso(new Date());
  const overdueDueIso = `${addMonths(currentPeriod(today), -FEE_TASKS_SCENARIO_MONTHS_BACK)}-${FEE_DUE_DAY}`;
  const lastDayOfMonth = addDays(
    `${addMonths(currentPeriod(today), 1)}-01`,
    -1,
  );
  const threeDaysAhead = addDays(today, FEE_TASKS_SCENARIO_DAYS_TO_DUE);
  const reminderDueIso =
    threeDaysAhead > lastDayOfMonth ? lastDayOfMonth : threeDaysAhead;

  for (const dueIso of [overdueDueIso, reminderDueIso]) {
    const period = currentPeriod(dueIso);
    const existing = await prisma.fee.findUnique({
      where: { unitId_period: { unitId, period } },
      select: { id: true },
    });
    if (existing) {
      console.log(`Escenario de H5 (${period}): ya existe, sin cambios`);
      continue;
    }

    const concept = defaultConcept(period);
    const generatedAt = svDateTime(`${period}-01`, '09:00');
    await prisma.$transaction(async (tx) => {
      const generation = await tx.feeGeneration.create({
        data: {
          period,
          amount: FEE_AMOUNT,
          dueDate: toDbDate(dueIso),
          concept,
          createdCount: 1,
          skippedCount: 0,
          createdById: admin.id,
          createdAt: generatedAt,
        },
      });
      await tx.fee.create({
        data: {
          unitId,
          generationId: generation.id,
          period,
          concept,
          amount: FEE_AMOUNT,
          dueDate: toDbDate(dueIso),
          createdAt: generatedAt,
        },
      });
    });
    console.log(
      `Escenario de H5 (${period}): cuota Pendiente que vence el ${dueIso}`,
    );
  }
}

type DirectoryShare = {
  visible: boolean;
  showName: boolean;
  showUnit: boolean;
  showPhone: boolean;
  showEmail: boolean;
};

const HIDDEN_IN_DIRECTORY: DirectoryShare = {
  visible: false,
  showName: false,
  showUnit: false,
  showPhone: false,
  showEmail: false,
};

const VISIBLE_IN_DIRECTORY: DirectoryShare = {
  ...HIDDEN_IN_DIRECTORY,
  visible: true,
  showName: true,
};

const DIRECTORY_SCENARIO: Record<string, DirectoryShare> = {
  residente1: {
    ...VISIBLE_IN_DIRECTORY,
    showUnit: true,
    showPhone: true,
    showEmail: true,
  },
  residente2: { ...VISIBLE_IN_DIRECTORY, showPhone: true },
  residente3: { ...VISIBLE_IN_DIRECTORY, showUnit: true },
  residente4: { ...VISIBLE_IN_DIRECTORY, showEmail: true },
  residente5: { ...VISIBLE_IN_DIRECTORY, showUnit: true, showEmail: true },
  residente6: HIDDEN_IN_DIRECTORY,
};

async function seedDirectoryScenario() {
  for (const [account, share] of Object.entries(DIRECTORY_SCENARIO)) {
    const email = `${account}@condominio.test`;
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, directoryPreference: { select: { id: true } } },
    });
    if (user.directoryPreference) {
      console.log(`Directorio de ${email}: ya tiene preferencias, sin cambios`);
      continue;
    }
    await prisma.directoryPreference.create({
      data: { userId: user.id, ...share },
    });
    console.log(
      `Directorio de ${email}: ${share.visible ? 'visible' : 'oculto'}`,
    );
  }
}

type AnnouncementScenario = {
  title: string;
  body: string;
  category: 'CORTE_SERVICIO' | 'MANTENIMIENTO' | 'AVISO_GENERAL';
  towerLetters: string[];
  publishedDaysAgo: number;
  expiresInDays: number;
  readers: string[] | typeof EVERY_RECIPIENT;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EVERY_RECIPIENT = 'todos';

const ANNOUNCEMENTS_SCENARIO: AnnouncementScenario[] = [
  {
    title: 'Mantenimiento de ascensores',
    body: 'El lunes no habrá servicio de ascensores de 8:00 a 12:00 por mantenimiento preventivo.',
    category: 'MANTENIMIENTO',
    towerLetters: [],
    publishedDaysAgo: 2,
    expiresInDays: 10,
    readers: ['residente1', 'residente4'],
  },
  {
    title: 'Corte de agua en Torre B',
    body: 'El jueves no habrá agua en la Torre B de 9:00 a 13:00 por reparación de tuberías.',
    category: 'CORTE_SERVICIO',
    towerLetters: ['B'],
    publishedDaysAgo: 0,
    expiresInDays: 3,
    readers: [],
  },
  {
    title: 'Fumigación de áreas comunes',
    body: 'El sábado se fumigarán las áreas comunes. Mantén cerradas las ventanas de 7:00 a 10:00.',
    category: 'AVISO_GENERAL',
    towerLetters: [],
    publishedDaysAgo: 20,
    expiresInDays: -5,
    readers: [
      'residente1',
      'residente2',
      'residente3',
      'residente4',
      'residente5',
    ],
  },
  {
    title: 'Corte de energía en Torre C',
    body: 'El viernes no habrá energía en la Torre C de 14:00 a 16:00 por cambio de transformador.',
    category: 'CORTE_SERVICIO',
    towerLetters: ['C'],
    publishedDaysAgo: 1,
    expiresInDays: 5,
    readers: EVERY_RECIPIENT,
  },
];

async function seedAnnouncementsScenario() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@condominio.test' },
  });
  const now = new Date();
  const today = todayIso(now);

  for (const scenario of ANNOUNCEMENTS_SCENARIO) {
    const existing = await prisma.announcement.findFirst({
      where: { title: scenario.title },
      select: { id: true },
    });
    if (existing) {
      console.log(`Comunicado "${scenario.title}": ya existe, sin cambios`);
      continue;
    }

    const forTowers = scenario.towerLetters.length > 0;
    const towers = await prisma.tower.findMany({
      where: { letter: { in: scenario.towerLetters } },
      select: { id: true },
    });
    if (towers.length !== scenario.towerLetters.length) {
      throw new Error(
        `Comunicado "${scenario.title}": torres ${scenario.towerLetters.join(', ')}, solo existen ${towers.length}`,
      );
    }
    const residents = await prisma.user.findMany({
      where: {
        role: 'RESIDENTE',
        isActive: true,
        unitId: { not: null },
        ...(forTowers && {
          unit: { towerId: { in: towers.map((tower) => tower.id) } },
        }),
      },
      select: { id: true, unitId: true, email: true },
    });
    const residentEmails = residents.map((resident) => resident.email);
    const readerEmails =
      scenario.readers === EVERY_RECIPIENT
        ? residentEmails
        : scenario.readers.map((account) => `${account}@condominio.test`);
    const missingReader = readerEmails.find(
      (email) => !residentEmails.includes(email),
    );
    if (missingReader) {
      throw new Error(
        `Comunicado "${scenario.title}": ${missingReader} no es destinatario`,
      );
    }

    const publishedAt = new Date(
      now.getTime() - scenario.publishedDaysAgo * DAY_MS,
    );
    const readStep =
      (now.getTime() - publishedAt.getTime()) / (readerEmails.length + 1);
    const recipients = residents.map((resident) => {
      const order = readerEmails.indexOf(resident.email);
      return {
        userId: resident.id,
        unitId: resident.unitId as string,
        readAt:
          order === -1
            ? null
            : new Date(publishedAt.getTime() + (order + 1) * readStep),
      };
    });

    await prisma.announcement.create({
      data: {
        title: scenario.title,
        body: scenario.body,
        category: scenario.category,
        audience: forTowers ? 'TORRES' : 'TODOS',
        publishedAt,
        expiresOn: toDbDate(addDays(today, scenario.expiresInDays)),
        createdById: admin.id,
        towers: { create: towers.map((tower) => ({ towerId: tower.id })) },
        recipients: { create: recipients },
      },
    });
    console.log(
      `Comunicado "${scenario.title}": ${readerEmails.length} de ${recipients.length} residentes lo leyeron`,
    );
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
