<!-- Reemplacen todo el texto entre corchetes y borren estos comentarios antes de entregar. -->

# Despliegue

## Dónde está desplegado

| Componente | Plataforma | URL | Rama |
|---|---|---|---|
| Frontend | [Vercel] | [https://...] | main |
| Backend | [Render] | [https://...] | main |
| Base de datos | [Neon] | (privada) | |

## Cómo se publica una nueva versión

1. [Rama release desde develop, PR hacia main, etiqueta vX.Y.Z]
2. [Qué pasa en la plataforma: despliegue automático al fusionar a main, o pasos manuales]

## Variables de entorno en producción

<!-- Solo los nombres, nunca los valores. -->

| Variable | Dónde se configura |
|---|---|
| [JWT_SECRET] | [Panel de Render, Environment] |
