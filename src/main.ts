import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { EnvConfig } from '@Config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<EnvConfig, true>);

  configureApp(app);

  // CORS: solo el frontend desplegado (FRONTEND_URL, separadas por coma si
  // son varias). Sin la variable, se permite el frontend local en el 3001.
  app.enableCors({
    origin: (process.env.FRONTEND_URL ?? 'http://localhost:3001')
      .split(',')
      .map((url) => url.trim().replace(/\/$/, ''))
      .filter((url) => url.length > 0),
  });

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SI Backend Boilerplate')
    .setDescription('API REST con autenticación por usuario y contraseña.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

await bootstrap();
