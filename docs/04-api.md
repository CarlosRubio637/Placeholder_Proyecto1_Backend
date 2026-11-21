<!-- Cada responsable agrega la tabla de sus módulos con el mismo formato. Borrar este comentario antes de entregar. -->

# API

**Documentación interactiva (Swagger):** [https://.../api/docs]

## Autenticación

[Cómo se obtiene el token, en qué encabezado se envía y cuánto dura.]

## Endpoints por módulo

Todas las rutas llevan el prefijo `/api/v1` y piden `Authorization: Bearer <token>`. Un rol distinto del indicado recibe 403. Los errores de validación responden 400 con el mensaje en español y `field` con el campo que falló.

### Módulo 1: Cuotas y pagos

<!-- H1 y H2: Carlos. -->

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/cuotas/generaciones/vista-previa | Unidades activas del periodo y cuántas recibirían cuota (H3) | Administrador |
| POST | /api/v1/cuotas/generaciones | Genera las cuotas del periodo para las unidades activas; omite las que ya tienen cuota de ese periodo (H3) | Administrador |
| GET | /api/v1/cuotas/generaciones | Historial de generaciones, la más reciente primero (H3) | Administrador |
| GET | /api/v1/morosidad | Unidades con cuotas en Moroso: resumen, monto, "Moroso desde" y días en mora. Filtros `towerId` y `search`, 20 por página (H4) | Administrador |
| POST | /api/v1/cuotas/tareas/ejecutar | Corre en el momento las tareas de mora y de recordatorios, con las mismas reglas que el horario. Responde `markedOverdue` y `remindersSent` (H5) | Administrador |

Las tareas de H5 también corren solas todos los días, en hora de El Salvador: el paso a Moroso a las 00:05 y los recordatorios a las 08:00.

### Módulo 7: Anuncios y comunicados

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/admin/comunicados/audiencia | Cuántos residentes recibirían un comunicado para todo el condominio o para las torres elegidas (H25) | Administrador |
| POST | /api/v1/admin/comunicados | Publica un comunicado para todo el condominio o para torres, y crea un destinatario por residente (H25) | Administrador |
| GET | /api/v1/admin/comunicados | Comunicados publicados con su estado (Vigente o Archivado) y sus lecturas. Filtros `status` y `category`, 20 por página (H26) | Administrador |
| GET | /api/v1/admin/comunicados/:id/lecturas | Comunicado completo y lectura de cada destinatario. Filtro `read`, 50 por página (H26) | Administrador |
| GET | /api/v1/comunicados | Comunicados de los que el residente es destinatario. Filtros `tab` (vigentes o archivados) y `category` (H27) | Residente |
| POST | /api/v1/comunicados/:id/lectura | Devuelve el comunicado completo y guarda la primera lectura del residente (H27) | Residente |

### Módulo 8: Directorio de residentes

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/perfil | Datos de la cuenta y preferencias de privacidad en el directorio (H28) | Residente |
| PUT | /api/v1/perfil | Guarda el teléfono y las preferencias de privacidad (H28) | Residente |
| GET | /api/v1/directorio | Busca vecinos visibles por nombre (`name`, 3 a 80 caracteres) o por torre y unidad (`towerId` y `unitNumber`). Solo devuelve los campos que cada vecino comparte; máximo 20 por página (H29) | Residente |

No existe un endpoint para exportar o descargar el directorio.
