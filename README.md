# Plataforma de gestión de condominios (backend)

Sistema web para administrar un condominio de tres torres: cuotas y pagos, reservas de áreas comunes, incidencias, control de visitas, paquetería, asambleas con votación, comunicados, directorio de residentes, notificaciones y reportes para la administración. Lo usan tres roles: Administrador, Residente y Personal de seguridad.

Este repositorio contiene el backend (API REST) y la documentación completa del sistema, en [`docs/`](docs/). El frontend está en [Placeholder_Proyecto1_Frontend](https://github.com/CarlosRubio637/Placeholder_Proyecto1_Frontend).

**Proyecto asignado:** Proyecto 1: Plataforma de gestión de condominios/edificios
**Equipo:** Placeholder
**Curso:** Ingeniería de Software, UCA, ciclo 02/2026, Sección 01
**Versión:** 1.0.0

## Ambiente desplegado

| Componente | URL |
|---|---|
| Frontend | https://placeholder-proyecto1-frontend.vercel.app |
| API | https://placeholderproyecto1backend-production.up.railway.app/api/v1 |
| Documentación de la API (Swagger) | https://placeholderproyecto1backend-production.up.railway.app/api/docs |

Los usuarios de prueba (uno por rol) se entregan en Moodle, no en este repositorio.

## Integrantes

| Nombre | Carnet | Usuario de GitHub | Rol en el equipo | Historias |
|---|---|---|---|---|
| Carlos Oswaldo Rubio Cuéllar | 00000822 | [CarlosRubio637](https://github.com/CarlosRubio637) | DevOps | H1, H2, H6, H7, H8, H9, H38 |
| Alison Michelle Maltez Valencia | 00100121 | [MichiiMaltz11](https://github.com/MichiiMaltz11) | Scrum Master | H10, H11, H12, H13, H15, H16, H30, H39 |
| Francisco Alejandro Erroa Ramos | 00300722 | [ferroa](https://github.com/ferroa) | Líder de backend | H14, H31, H32, H33, H34, H35, H36, H37 |
| Luis Andree Hernandez Maltez | 00012321 | [LuisHMaltez](https://github.com/LuisHMaltez) | QA | H17, H18, H19, H20, H21, H22, H23, H24 |
| André Alberto Calidonio Campos | 00363918 | [acalidonio](https://github.com/acalidonio) | Líder de frontend | H3, H4, H5, H25, H26, H27, H28, H29 |

Las 39 historias están terminadas. El detalle de cada una, con su card y sus PR, está en [Historias por módulo](docs/08-historias.md).

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| NestJS | 12 | Framework HTTP: módulos, guards, pipes y tareas programadas (`@nestjs/schedule`) |
| TypeScript | 6 | Tipado estático. El proyecto es ESM puro |
| Prisma ORM | 7 | ORM y migraciones |
| PostgreSQL | 18 | Base de datos |
| JWT y bcrypt | | Autenticación con access token y refresh token |
| Swagger | | Documentación de la API en `/api/docs` |
| Vitest | 4 | Pruebas unitarias y de integración |

El backend tiene un módulo de NestJS por módulo del sistema. Todas las rutas llevan el prefijo `/api/v1`, y los roles se validan con un guard global.

## Inicio rápido

Después de copiar el `.env`, completar `JWT_SECRET`, `SEED_DEMO_PASSWORD` y `SEED_TEST_PASSWORD`. Sin las dos últimas, el seed se detiene.

```bash
cp .env.example .env
docker compose up -d postgres
npm ci
npm run prisma:deploy
npm run db:seed
npm run start:dev
```

La API queda en http://localhost:3000/api/v1 y Swagger en http://localhost:3000/api/docs. Los pasos completos, las variables de entorno y cómo correr el frontend están en [Instalación local](docs/05-instalacion-local.md).

## Documentación

1. [Guía de uso](docs/01-guia-de-uso.md): roles y flujos principales de cada módulo, con capturas.
2. [Arquitectura](docs/02-arquitectura.md): cómo se comunican el frontend, el backend y la base de datos.
3. [Modelo de datos](docs/03-modelo-de-datos.md): entidades, relaciones y estados.
4. [API](docs/04-api.md): autenticación y endpoints por módulo.
5. [Instalación local](docs/05-instalacion-local.md): cómo levantar el sistema en una computadora.
6. [Despliegue](docs/06-despliegue.md): dónde está publicado y cómo se publica una versión.
7. [Forma de trabajo](docs/07-forma-de-trabajo.md): tablero, roles, ramas, commits y pull requests.
8. [Historias por módulo](docs/08-historias.md): las 39 historias con su card, sus PR y su estado.
9. [Problemas conocidos](docs/09-problemas-conocidos.md): limitaciones conocidas de la versión 1.0.0.
