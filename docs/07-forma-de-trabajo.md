<!-- Reemplacen todo el texto entre corchetes y borren estos comentarios antes de entregar. -->

# Forma de trabajo

**Tablero:** [enlace al tablero]

## Ramas (Git Flow)

- `main`: código en producción. Recibe cambios desde `release/*` y `hotfix/*`.
- `develop`: rama de integración.
- `feature/<ID>-<descripcion>`: una rama por historia.
- `bugfix/<ID>-<descripcion>`: correcciones de defectos encontrados en las pruebas.
- `release/<version>` y `hotfix/<descripcion>`: publicación y correcciones de producción.

## Commits

Formato `<tipo>(<ID>): <descripción>`, por ejemplo `feat(H5): valida el traslape de reservas`.
Tipos que usamos: [feat, fix, test, docs, chore, ...]

## Pull requests

[Título, descripción con enlace a la card, quién aprueba y cuándo se fusiona.]
