import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { validationExceptionFactory } from '@Common/validation';

export const API_PREFIX = 'api/v1';

/**
 * Configuración HTTP común de la app. La comparten main.ts y las pruebas de
 * integración, para que estas ejerciten el mismo prefijo y la misma validación
 * que producción.
 */
export function configureApp(app: INestApplication): void {
  // Versionado en la URI: /api/v1/...
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      // Descarta propiedades que no estén en el DTO...
      whitelist: true,
      // ...y además rechaza la request con 400 si vienen de más, en vez de
      // ignorarlas en silencio.
      forbidNonWhitelisted: true,
      // Convierte el payload al tipo del DTO (los query/params llegan string).
      transform: true,
      // Agrega `field` (primer campo que falló) a la respuesta 400.
      exceptionFactory: validationExceptionFactory,
    }),
  );
}
