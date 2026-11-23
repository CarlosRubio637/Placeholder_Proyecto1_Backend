import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA } from '@nestjs/common/constants';
import { NotificationsController } from './controllers/index.js';
import { NotificationsModule } from './notifications.module.js';
import { NotificationRepository } from './repositories/index.js';
import { NotificationsService } from './services/index.js';

const SRC = join(process.cwd(), 'src');
const ONLY_WRITER = 'notifications/repositories/notification.repository.ts';

/** Archivos .ts del código del servidor, sin pruebas ni el cliente generado. */
function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'generated' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

function httpMethodsOf(controller: object): RequestMethod[] {
  const proto = (controller as { prototype: object }).prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map(
      (name) =>
        Reflect.getMetadata(
          METHOD_METADATA,
          Reflect.get(proto, name),
        ) as RequestMethod,
    )
    .filter((method) => method !== undefined);
}

describe('H30. Servicio interno de envío de avisos para los demás módulos', () => {
  it('AC1: NotificationsModule exporta solo NotificationsService, no el repositorio', () => {
    const exported: unknown[] = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      NotificationsModule,
    );

    expect(exported).toEqual([NotificationsService]);
    expect(exported).not.toContain(NotificationRepository);
  });

  it('AC1: ningún otro módulo crea registros de Notification', () => {
    const writers = sourceFiles()
      .filter((file) =>
        /\.notification\.(create|createMany|upsert)\b/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(SRC, file));

    expect(writers).toEqual([ONLY_WRITER]);
  });

  it('AC6: no hay endpoint HTTP para enviar: la bandeja solo tiene GET y PATCH', () => {
    const methods = httpMethodsOf(NotificationsController);

    expect(methods.length).toBeGreaterThan(0);
    expect(methods).not.toContain(RequestMethod.POST);
    expect(methods).not.toContain(RequestMethod.PUT);
    expect(new Set(methods)).toEqual(
      new Set([RequestMethod.GET, RequestMethod.PATCH]),
    );
  });

  it('AC6: ningún controlador recibe NotificationsService, así que ningún rol puede invocar el envío', () => {
    const controllers = sourceFiles()
      .filter((file) => file.endsWith('.controller.ts'))
      .filter((file) =>
        readFileSync(file, 'utf8').includes('NotificationsService'),
      )
      .map((file) => relative(SRC, file));

    expect(controllers).toEqual([]);
  });
});
