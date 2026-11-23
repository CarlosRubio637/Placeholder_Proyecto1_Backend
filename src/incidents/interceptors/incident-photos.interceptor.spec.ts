import { Readable } from 'node:stream';
import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { of } from 'rxjs';
import { MAX_PHOTO_BYTES } from '../incidents.constants.js';
import { IncidentPhotosInterceptor } from './incident-photos.interceptor.js';

const BOUNDARY = '----h10-prueba';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

type Part =
  | { field: string; value: string }
  | { field: string; filename: string; content: Buffer };

/** Arma un multipart/form-data real, como el que manda el navegador. */
function multipart(parts: Part[]) {
  const chunks = parts.flatMap((part) => {
    const head =
      'filename' in part
        ? `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.field}"; filename="${part.filename}"\r\nContent-Type: image/png\r\n\r\n`
        : `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.field}"\r\n\r\n`;
    const body = 'filename' in part ? part.content : Buffer.from(part.value);
    return [Buffer.from(head), body, Buffer.from('\r\n')];
  });
  const buffer = Buffer.concat([...chunks, Buffer.from(`--${BOUNDARY}--\r\n`)]);
  const req = Object.assign(Readable.from([buffer]), {
    headers: {
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      'content-length': String(buffer.length),
    },
  });
  return req as unknown as Readable & { files?: unknown[]; body?: unknown };
}

const photo = (n: number, content = PNG): Part => ({
  field: 'photos',
  filename: `foto${n}.png`,
  content,
});

async function run(parts: Part[]) {
  const req = multipart(parts);
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of('ok') };
  const result = await new IncidentPhotosInterceptor()
    .intercept(context, next)
    .catch((e: unknown) => e);
  return { req, result };
}

function bodyOf(error: unknown) {
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse();
}

describe('H10. Registro de incidencia con evidencia', () => {
  it('AC5: deja pasar de 1 a 3 fotografías con los campos de texto', async () => {
    const { req, result } = await run([
      { field: 'title', value: 'Fuga de agua' },
      photo(1),
      photo(2),
      photo(3),
    ]);

    expect(result).not.toBeInstanceOf(Error);
    expect(req.files).toHaveLength(3);
    expect(req.body).toMatchObject({ title: 'Fuga de agua' });
  });

  it('AC5: rechaza una cuarta fotografía con 400 en photos', async () => {
    const { result } = await run([photo(1), photo(2), photo(3), photo(4)]);

    expect(bodyOf(result)).toMatchObject({
      field: 'photos',
      message: ['Puedes adjuntar como máximo 3 fotografías.'],
    });
  });

  it('AC5: rechaza un archivo de más de 5 MB con 400 en photos', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_PHOTO_BYTES)]);
    const { result } = await run([photo(1, big)]);

    expect(bodyOf(result)).toMatchObject({
      field: 'photos',
      message: ['Solo se permiten imágenes JPG o PNG de hasta 5 MB.'],
    });
  });

  it('AC5: rechaza un archivo en otro campo con 400 en ese campo', async () => {
    const { result } = await run([
      { field: 'title', filename: 'x.png', content: PNG },
    ]);

    expect(bodyOf(result)).toMatchObject({
      field: 'title',
      message: ['Este campo no admite archivos.'],
    });
  });
});
