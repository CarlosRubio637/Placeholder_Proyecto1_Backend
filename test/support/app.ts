import { readdirSync, rmSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/prisma/services/index.js';
import { TEST_DATABASE, testEnv } from './test-env.js';

export const PASSWORD = 'Prueba2026';

/** Tablas que llena el seed: se conservan entre flujos. */
const SEED_TABLES = [
  '_prisma_migrations',
  'towers',
  'units',
  'users',
  'profiles',
  'maintenance_staff',
  'common_areas',
  'fee_generations',
  'fees',
];

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** Deja la base solo con el seed y sin archivos subidos. */
export async function resetData(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const [{ current_database: database }] = await prisma.$queryRaw<
    { current_database: string }[]
  >`SELECT current_database()`;
  if (database !== TEST_DATABASE) {
    throw new Error(`resetData solo corre en ${TEST_DATABASE}: ${database}`);
  }

  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows
    .map((row) => row.tablename)
    .filter((name) => !SEED_TABLES.includes(name))
    .map((name) => `"${name}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.join(', ')} CASCADE`);

  rmSync(testEnv.UPLOADS_DIR, { recursive: true, force: true });
}

/** Archivos subidos en este momento, para comprobar que no quedan huérfanos. */
export function uploadedFiles(): string[] {
  try {
    return readdirSync(testEnv.UPLOADS_DIR, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Cliente HTTP con el prefijo de la API y, opcionalmente, la sesión. */
export function api(app: INestApplication, token?: string) {
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  const withAuth = (test: request.Test) =>
    token ? test.set('Authorization', `Bearer ${token}`) : test;
  const url = (path: string) => `/${API_PREFIX}/${path}`;
  return {
    get: (path: string) => withAuth(request(server).get(url(path))),
    post: (path: string) => withAuth(request(server).post(url(path))),
    patch: (path: string) => withAuth(request(server).patch(url(path))),
    put: (path: string) => withAuth(request(server).put(url(path))),
    delete: (path: string) => withAuth(request(server).delete(url(path))),
  };
}

/** Inicia sesión con una cuenta del seed y devuelve su access token. */
export async function login(
  app: INestApplication,
  account: string,
): Promise<string> {
  const response = await api(app)
    .post('auth/login')
    .send({ email: `${account}@condominio.test`, password: PASSWORD })
    .expect(200);
  return (response.body as { accessToken: string }).accessToken;
}

/** Bytes con la firma de cada formato: el backend valida por contenido. */
export const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03,
]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x04, 0x05, 0x06]);

/** Acceso directo a la base, para preparar datos que la API no permite crear. */
export function db(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  sourceModule: string;
  referenceType: string | null;
  referenceId: string | null;
  readAt: string | null;
};

/** Bandeja completa del usuario (H31). */
export async function inbox(
  app: INestApplication,
  token: string,
): Promise<NotificationRow[]> {
  const { body } = await api(app, token).get('notificaciones').expect(200);
  return (body as { data: NotificationRow[] }).data;
}

export async function unreadCount(
  app: INestApplication,
  token: string,
): Promise<number> {
  const { body } = await api(app, token)
    .get('notificaciones/no-leidas/conteo')
    .expect(200);
  return (body as { count: number }).count;
}
