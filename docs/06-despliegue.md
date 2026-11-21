# Despliegue

## Dónde está desplegado

| Componente | Plataforma | URL | Rama |
|---|---|---|---|
| Frontend | Vercel | https://placeholder-proyecto1-frontend.vercel.app | main |
| Backend | Railway | https://placeholderproyecto1backend-production.up.railway.app/api/v1 (Swagger en https://placeholderproyecto1backend-production.up.railway.app/api/docs) | main |
| Base de datos | PostgreSQL en Railway | (privada) | |

Los dos repositorios tienen su `Dockerfile`. El `CMD` de la imagen del backend solo arranca `node dist/main.js`; las migraciones se aplican con `npx prisma migrate deploy` antes de arrancarla, como hace el `command` del servicio `api` en `docker-compose.yml`. La imagen del frontend lee `API_URL` al arrancar, así que la misma imagen sirve para local y para producción.

## Cómo se publica una nueva versión

1. Abrir un PR de `develop` a `main` con la lista de historias de la versión. Lo aprueba un integrante distinto del autor.
2. Publicar desde `main` la imagen del backend y la del frontend, y aplicar las migraciones pendientes con `npx prisma migrate deploy` antes de arrancar el backend.
3. Crear la etiqueta `vX.Y.Z` en GitHub Releases sobre `main`, con la lista de historias.
4. Fusionar `main` de regreso a `develop` para que las dos ramas queden iguales.
5. Revisar que Swagger responda en `/api/docs` y que se pueda iniciar sesión en el frontend.

Los datos iniciales (`npm run db:seed`) se cargan una sola vez, contra la base de producción, desde una computadora con la `DATABASE_URL` de producción y con `SEED_DEMO_PASSWORD` y `SEED_TEST_PASSWORD` definidas. Esas contraseñas no se guardan en el repositorio: las de las cuentas de prueba se entregan en Moodle.

## Variables de entorno en producción

| Variable | Dónde se configura |
|---|---|
| `DATABASE_URL` | Variables del servicio del backend en Railway |
| `JWT_SECRET` | Variables del servicio del backend en Railway |
| `JWT_EXPIRES_IN` | Variables del servicio del backend en Railway |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Variables del servicio del backend en Railway |
| `BCRYPT_SALT_ROUNDS` | Variables del servicio del backend en Railway |
| `NODE_ENV` | Variables del servicio del backend en Railway (`production`) |
| `PORT` | Variables del servicio del backend en Railway |
| `PAYMENT_GATEWAY_DELAY_MS` | Variables del servicio del backend en Railway (opcional) |
| `UPLOADS_DIR` | Variables del servicio del backend en Railway (opcional) |
| `FRONTEND_URL` | Variables del servicio del backend en Railway. Origen permitido por CORS: la URL del frontend en Vercel |
| `API_URL` | Variables de entorno del proyecto en Vercel |
