# Instalación local

## Requisitos

- Docker y Docker Compose v2 o superior (comando `docker compose`).
- Node.js 20.19, 22.12 o 24 o superior para correr el backend fuera de Docker, que es lo que Prisma 7 admite. La imagen del backend usa Node 24.
- Node.js 22 o superior para correr el frontend fuera de Docker. La imagen del frontend usa Node 24.

## Pasos

### Backend y base de datos

Opción recomendada para desarrollar: PostgreSQL en Docker y la API en la computadora.

1. Clonar el repositorio del backend.
2. Copiar el archivo de variables: `cp .env.example .env`. Cambiar `JWT_SECRET` por un valor propio de al menos 32 caracteres, por ejemplo con `openssl rand -base64 32`. Definir también `SEED_DEMO_PASSWORD` y `SEED_TEST_PASSWORD`, las contraseñas con las que el seed crea las cuentas.
3. Levantar solo la base de datos: `docker compose up -d postgres`.
4. Instalar las dependencias: `npm ci`. El `postinstall` genera el cliente de Prisma.
5. Aplicar las migraciones: `npm run prisma:deploy`.
6. Cargar los datos iniciales: `npm run db:seed`. Crea las 3 torres, las 48 unidades, las áreas comunes, los responsables de mantenimiento y las cuentas de prueba. Se puede correr varias veces sin duplicar datos.
7. Arrancar la API en modo watch: `npm run start:dev`.
8. Abrir http://localhost:3000/api/docs para ver Swagger. La API responde en http://localhost:3000/api/v1.

Todo con Docker:

```
cp .env.example .env
docker compose up -d --build
```

El servicio `api` espera a que PostgreSQL pase su healthcheck y aplica las migraciones antes de arrancar. Los datos iniciales se cargan desde la computadora con `npm ci` y `npm run db:seed`, porque la imagen de la API no incluye el código fuente que importa `prisma/seed.ts`. Las fotos de incidencias quedan en el volumen `uploads` y los datos de la base en el volumen `pgdata`. `docker compose down -v` borra los dos.

### Frontend

El frontend está en [Placeholder_Proyecto1_Frontend](https://github.com/CarlosRubio637/Placeholder_Proyecto1_Frontend) y necesita el backend corriendo.

1. Clonar el repositorio del frontend.
2. Copiar el archivo de variables: `cp .env.example .env.local`. El valor por defecto de `API_URL` apunta al backend local.
3. Instalar las dependencias: `npm ci`.
4. Levantar el servidor de desarrollo en el puerto 3001, porque el backend usa el 3000: `npm run dev -- -p 3001`.
5. Abrir http://localhost:3001 e iniciar sesión con un usuario del seed.

Con Docker, sin instalar Node:

```
docker build -t condominio-frontend .
docker run -p 3001:3000 -e API_URL=http://host.docker.internal:3000/api/v1/ condominio-frontend
```

## Variables de entorno

### Backend

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | Obligatoria. Cadena de conexión a PostgreSQL que usan la API y el CLI de Prisma. Dentro de docker-compose, el servicio `api` la reemplaza para apuntar al host `postgres`. | `postgresql://postgres:postgres@localhost:5432/si_be_boilerplate?schema=public` |
| `JWT_SECRET` | Obligatoria. Secreto para firmar los access token. Debe tener al menos 32 caracteres o la API no arranca. | Valor generado con `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | Vigencia del access token. Si no está definida, `15m`. | `8h` |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Días de vigencia del refresh token. Por defecto, 7. | `7` |
| `BCRYPT_SALT_ROUNDS` | Costo de bcrypt para las contraseñas. Por defecto, 12. | `12` |
| `NODE_ENV` | Entorno de ejecución. | `development` |
| `PORT` | Puerto HTTP de la API. Por defecto, 3000. | `3000` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` y `POSTGRES_PORT` | Los usa docker-compose para crear el contenedor de PostgreSQL y publicar su puerto. | `postgres`, `postgres`, `si_be_boilerplate` y `5432` |
| `PAYMENT_GATEWAY_DELAY_MS` | Espera de la pasarela de pago simulada, en milisegundos (H1). Por defecto, 2000. | `2000` |
| `SEED_DEMO_PASSWORD` | Obligatoria para `npm run db:seed`. Contraseña del usuario demo. No la usa la API. | Un valor propio |
| `SEED_TEST_PASSWORD` | Obligatoria para `npm run db:seed`. Contraseña de todas las cuentas de prueba. No la usa la API. | Un valor propio |
| `UPLOADS_DIR` | Carpeta donde se guardan las fotos de incidencias. Por defecto, `uploads` en la raíz del proyecto; en docker-compose, `/app/uploads`. | `uploads` |

La API valida las variables obligatorias al arrancar. Si falta `DATABASE_URL` o `JWT_SECRET`, o el secreto es corto, se detiene con un mensaje que indica cuál.

### Frontend

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL base de la API, con el prefijo `api/v1` y la barra final. Solo la lee el servidor de Next, al arrancar. | `http://localhost:3000/api/v1/` |

## Pruebas automatizadas

### Backend

```
npm test
npm run test:e2e
```

- `npm test` corre las pruebas unitarias con Vitest. Están junto al código que prueban, en `src/`, con el sufijo `.spec.ts`. No usan la base de datos: los repositorios se reemplazan con dobles.
- `npm run test:e2e` corre las pruebas de integración de `test/`, con el sufijo `.e2e-spec.ts`. `test/flows/` tiene un archivo por flujo (por ejemplo `pagos-estado-cuenta.e2e-spec.ts` y `reservas.e2e-spec.ts`) y `test/permisos.e2e-spec.ts` revisa los roles de las rutas. Usan una base propia, `si_be_test`, que se recrea en cada corrida en el PostgreSQL de Docker, así que no tocan los datos de desarrollo. La pasarela de pago corre sin espera.
- `npm run test:cov` genera el reporte de cobertura.

### Frontend

```
npm test
```

Vitest con Testing Library y jsdom. Los archivos de prueba están junto al código que prueban, con el sufijo `.test.ts` o `.test.tsx`. Cada archivo agrupa sus casos en un `describe` con el ID y el título de la historia, por ejemplo `describe("H4. Reporte de unidades morosas")`, y cada caso empieza con el criterio que cubre: `it("AC3: ...")`. Las pruebas no llaman al backend: `apiFetch` y la navegación de Next se reemplazan con mocks.
