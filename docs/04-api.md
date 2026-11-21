<!-- Cada responsable agrega la tabla de sus módulos con el mismo formato. Borrar este comentario antes de entregar. -->

# API

**Documentación interactiva (Swagger):** [https://.../api/docs]

## Autenticación

La API usa un access token JWT y un refresh token opaco.

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/auth/registro | Crea la cuenta de un residente con el código de registro de su unidad. Siempre asigna el rol Residente (H38) | Público |
| POST | /api/v1/auth/login | Recibe `email` y `password`. Responde `accessToken`, `refreshToken`, `expiresIn` (segundos de vida del access token) y `user` | Público |
| POST | /api/v1/auth/refresh | Canjea el `refreshToken` por un par nuevo. El refresh token usado queda revocado | Público |
| POST | /api/v1/auth/logout | Revoca el `refreshToken`. Responde 204 | Público |
| GET | /api/v1/auth/me | Usuario autenticado con su rol, nombre y unidad. El frontend lo usa para armar el menú | Todos |

- El access token se envía en el encabezado `Authorization: Bearer <accessToken>`. Todas las rutas lo piden, salvo las cuatro marcadas como públicas.
- Su duración la define `JWT_EXPIRES_IN`. `.env.example` usa `8h`; si la variable no está definida, dura `15m`.
- El refresh token dura `REFRESH_TOKEN_EXPIRES_IN_DAYS` días (7 por defecto). En la base se guarda solo su hash, en `refresh_tokens`. Cada renovación lo rota: usar uno ya canjeado, revocado o vencido responde 401.
- Un token ausente, inválido o vencido responde 401. Las credenciales incorrectas y las cuentas inactivas responden 401 con "Credenciales inválidas.".
- Los roles se validan con un guard global. Un rol sin permiso recibe 403 con `code: "FORBIDDEN"` y "No tienes permiso para esta acción.".
- El frontend guarda el access token en la cookie httpOnly `session`. Si el backend responde 401 con una sesión activa, borra la cookie y lleva a la pantalla de inicio de sesión con el aviso de sesión expirada.

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

### Módulo 4: Control de acceso de visitas

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/visitas | Preautoriza un visitante para una fecha de hoy a 30 días, con hora estimada en pasos de 15 minutos. Devuelve un código de 6 caracteres válido ese día de 06:00 a 22:00. Un visitante con autorización para esa fecha responde 409 (H14) | Residente |

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

### Módulo 9: Notificaciones

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/notificaciones | Notificaciones del usuario, de la más reciente a la más antigua. Filtros `sourceModule` y `unread`; 20 por página, máximo 100 (H31) | Todos |
| GET | /api/v1/notificaciones/no-leidas/conteo | Cantidad de notificaciones no leídas. La campana del encabezado la consulta cada 30 segundos (H31) | Todos |
| PATCH | /api/v1/notificaciones/:id/leida | Marca una notificación como leída. Una notificación de otro usuario responde 404 (H31) | Todos |
| PATCH | /api/v1/notificaciones/leidas | Marca como leídas todas las no leídas del usuario (H31) | Todos |

Las notificaciones las crea solo el servicio interno de envío (H30); no hay un endpoint para crearlas.

### Módulo 10: Reportes para la administración

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/admin/reportes/morosidad | Monto adeudado, unidades morosas y porcentaje, con la tabla de unidades morosas de mayor a menor antigüedad. Filtros `from` y `to` por fecha de vencimiento (por defecto los últimos 12 meses, máximo 366 días); 20 por página (H32) | Administrador |
| GET | /api/v1/admin/reportes/areas | Por área habilitada: reservas confirmadas y canceladas, horas reservadas, horas habilitadas y ocupación, más el área más usada y la menos usada. Filtros `from` y `to` (por defecto el mes actual) (H33) | Administrador |
| GET | /api/v1/admin/reportes/incidencias | Tabla por estado y prioridad de las incidencias creadas en el periodo, total de abiertas y tiempo promedio de resolución. Incluye la lista de abiertas con más de 7 días, que no depende del periodo. Filtros `from` y `to` (por defecto el mes actual); 20 por página (H34) | Administrador |
| GET | /api/v1/admin/reportes/participacion | Participación por tema y promedio por asamblea, de las asambleas abiertas y cerradas. Filtro `assemblyId` o `from` y `to` por fecha de apertura (por defecto los últimos 12 meses); 10 por página (H35) | Administrador |
| GET | /api/v1/admin/reportes/morosidad/exportar | Exporta el reporte de morosidad (H36) | Administrador |
| GET | /api/v1/admin/reportes/areas/exportar | Exporta el reporte de uso de áreas comunes (H36) | Administrador |
| GET | /api/v1/admin/reportes/incidencias/exportar | Exporta el reporte de incidencias. La tabla cruzada va en el resumen y la tabla son las abiertas con más de 7 días (H36) | Administrador |
| GET | /api/v1/admin/reportes/participacion/exportar | Exporta el reporte de participación, con una fila por tema de cada asamblea (H36) | Administrador |
| GET | /api/v1/admin/reportes/resumen | Las cuatro tarjetas del resumen en una sola respuesta: morosidad de los últimos 12 meses, ocupación promedio y área más usada del mes, incidencias abiertas hoy y de más de 7 días, y participación de la última asamblea cerrada (H37) | Administrador |

Las rutas de exportación reciben `format` (`pdf` o `csv`) y los mismos filtros de su reporte, sin paginación. Responden el archivo con `Content-Disposition: attachment; filename="<reporte>_<desde>_<hasta>.<pdf|csv>"`. El CSV usa UTF-8 con BOM y coma como separador. El PDF se genera con `pdfkit` e incluye los filtros, la fecha y hora de generación, el administrador que lo generó, las cifras resumen y la tabla completa. Más de 5,000 filas responde 400 con "El reporte supera 5,000 filas. Reduce el rango.".
