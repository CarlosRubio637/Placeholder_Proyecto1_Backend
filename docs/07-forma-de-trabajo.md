# Forma de trabajo

**Tablero:** [Jira, proyecto SCRUM](https://gestiondecondominios.atlassian.net/jira/software/projects/SCRUM/boards/1)

## Equipo y roles

Cada integrante desarrolla sus historias completas, del backend al frontend, porque la evaluación es individual. Además, cada quien tiene un rol en el equipo:

| Integrante | Rol | Qué hace en ese rol |
|---|---|---|
| Michelle Maltez | Scrum Master | Ordena el sprint por prioridad y dependencias, da seguimiento al tablero y coordina las entregas. |
| Carlos Rubio | DevOps | Dueño de los repositorios. Fusiona los PR aprobados, publica las versiones y mantiene el despliegue. |
| Francisco Erroa | Líder de backend | Revisa los PR del backend. |
| André Calidonio | Líder de frontend | Revisa los PR del frontend. |
| Luis Hernández | QA | Prueba cada historia contra sus criterios de aceptación cuando la card pasa a Control de calidad. |

## Sprints

| Sprint | Fechas | Historias |
|---|---|---|
| Primer avance | 5 al 8 de noviembre de 2026 | 20 historias: la base (H38, H39 y H30) y la primera historia de cada módulo |
| Segundo avance | 17 al 20 de noviembre de 2026 | Las 19 historias restantes |

Al iniciar cada sprint, las cards se ordenan en el tablero por prioridad y dependencias, para que primero se hagan las historias que otras necesitan (por ejemplo, H16 antes de H17 y H18, o H1 antes de H2). Cada card tiene responsable, prioridad y fecha límite.

## Estados del tablero

Por hacer → En progreso → Code Review → Control de calidad → Finalizado.

- **En progreso:** el responsable creó su rama y está trabajando.
- **Code Review:** los PR de backend y frontend están abiertos. Si el revisor pide cambios, la card vuelve a En progreso.
- **Control de calidad:** los PR están fusionados en `develop` y QA prueba la historia.
- **Finalizado:** la historia pasó QA. La card tiene los enlaces a sus PR.

## Ramas (Git Flow)

- `main`: código en producción. Recibe cambios desde `develop` con un PR de versión.
- `develop`: rama de integración. Todo entra por PR.
- `feature/<ID>-<descripcion>`: una rama por historia, creada desde `develop` actualizado. Por ejemplo, `feature/H16-registro-entrada-visitantes`.
- `fix/<ID>-<descripcion>`: correcciones de defectos encontrados en revisión o en QA.
- `test/<descripcion>`: pruebas unitarias y de integración.
- `chore/<descripcion>` y `docs/<descripcion>`: despliegue, configuración y documentación.

## Commits

Formato `<tipo>(<ID>): <descripción>`, por ejemplo `feat(H5): valida el traslape de reservas`.
Tipos que usamos: `feat` (funcionalidad nueva), `fix` (corrección), `test` (pruebas), `docs` (documentación) y `chore` (configuración y despliegue).

## Pull requests

- **Título:** `H<ID>. <Título de la historia>`, con `(backend)` o `(frontend)` cuando hace falta distinguirlos. Por ejemplo, `H16. Registro de entrada de visitantes (backend)`.
- **Descripción:** qué hace el PR, cómo probarlo y el enlace a la card de Jira. La card también lleva el enlace a sus PR.
- **Antes de pedir revisión:** la rama se actualiza con `develop`. Si `develop` cambia después de la aprobación, GitHub descarta la aprobación y hay que pedirla de nuevo.
- **Quién aprueba:** al menos un integrante distinto del autor. Los PR de backend los revisa Francisco y los de frontend, André. Los PR de Francisco los revisa Carlos y los de André, Michelle.
- **Horarios de revisión:** dos rondas al día, de 12:30 a 1:30 p. m. y de 9:00 a 10:00 p. m. Un PR abierto antes de las 8:30 p. m. entra en la ronda de la noche.
- **Cuándo se fusiona:** cuando tiene la aprobación y no tiene conflictos. Lo fusiona Carlos a `develop`, y la card pasa a Control de calidad.

## Versiones

La versión 1.0.0 se publica con un PR de `develop` a `main` aprobado por otro integrante. Después, `main` regresa a `develop` para que las dos ramas queden iguales, y se crea la etiqueta `v1.0.0` en GitHub Releases con la lista de historias.
