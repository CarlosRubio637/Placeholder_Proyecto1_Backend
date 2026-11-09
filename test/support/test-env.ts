import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';

export const TEST_DATABASE = 'si_be_test';

/**
 * Variables de las pruebas de integración. Salen del .env de cada quien, así
 * que no hay nada extra que configurar, pero apuntan SIEMPRE a una base y una
 * carpeta de archivos propias: nunca tocan los datos de desarrollo.
 */
function buildTestEnv(): Record<string, string> {
  const fromFile = parse(readFileSync('.env'));
  const base = process.env.DATABASE_URL ?? fromFile.DATABASE_URL;
  if (!base) throw new Error('Falta DATABASE_URL en el .env.');

  const url = new URL(base);
  url.pathname = `/${TEST_DATABASE}`;

  return {
    ...fromFile,
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    UPLOADS_DIR: join(tmpdir(), 'si_be_test_uploads'),
  };
}

export const testEnv = buildTestEnv();
