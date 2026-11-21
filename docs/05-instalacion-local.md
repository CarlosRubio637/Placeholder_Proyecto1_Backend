<!-- Backend y base de datos: Carlos. Frontend: André. Borrar este comentario antes de entregar. -->

# Instalación local

## Requisitos

- Docker y docker-compose [versión]
- Node.js 22 o superior para correr el frontend fuera de Docker. La imagen del frontend usa Node 24.

## Pasos

### Backend y base de datos

1. Clonar el repositorio.
2. Copiar el archivo de variables: `cp .env.example .env` y completar los valores.
3. Levantar los servicios: `docker-compose up -d`
4. Cargar los datos semilla: `[comando del script de datos semilla]`
5. Abrir [http://localhost:...]

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
| [DATABASE_URL] | [Cadena de conexión a PostgreSQL] | [postgresql://user:pass@localhost:5432/db] |

### Frontend

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL base de la API, con el prefijo `api/v1` y la barra final. Solo la lee el servidor de Next, al arrancar. | `http://localhost:3000/api/v1/` |

## Pruebas automatizadas

### Backend

```
npm test
```

[Dónde están los archivos de prueba y cómo se nombran.]

### Frontend

```
npm test
```

Vitest con Testing Library y jsdom. Los archivos de prueba están junto al código que prueban, con el sufijo `.test.ts` o `.test.tsx`. Cada archivo agrupa sus casos en un `describe` con el ID y el título de la historia, por ejemplo `describe("H4. Reporte de unidades morosas")`, y cada caso empieza con el criterio que cubre: `it("AC3: ...")`. Las pruebas no llaman al backend: `apiFetch` y la navegación de Next se reemplazan con mocks.
