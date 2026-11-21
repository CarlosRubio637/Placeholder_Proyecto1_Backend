import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { Client } from 'pg';
import { TEST_DATABASE, testEnv } from './test-env.js';

/** Se ejecuta una vez: deja la base de pruebas recién creada y con el seed. */
export default async function setup(): Promise<() => void> {
  const url = new URL(testEnv.DATABASE_URL);
  // Doble seguro: esta función borra la base a la que apunta.
  if (url.pathname !== `/${TEST_DATABASE}`) {
    throw new Error(`Base de pruebas inesperada: ${url.pathname}`);
  }

  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${TEST_DATABASE}`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, ...testEnv };
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env, stdio: 'pipe' });
  execFileSync('npx', ['prisma', 'db', 'seed'], { env, stdio: 'pipe' });

  const cleanUploads = () =>
    rmSync(testEnv.UPLOADS_DIR, { recursive: true, force: true });
  cleanUploads();
  return cleanUploads;
}
