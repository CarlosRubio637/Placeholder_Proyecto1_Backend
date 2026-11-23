# API

**Documentación interactiva (Swagger):** https://placeholderproyecto1backend-production.up.railway.app/api/docs

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

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/estado-cuenta | Estado de cuenta de la unidad del residente: saldo pendiente, cuotas morosas, próximo vencimiento y cuotas del periodo más reciente al más antiguo. Filtros `year` y `status`, 12 por página (máximo 50). La unidad sale del token (H2) | Residente |
| GET | /api/v1/cuotas/:cuotaId | Cuota de la unidad del residente, para mostrarla antes de pagar. Una cuota de otra unidad responde 404 (H1) | Residente |
| POST | /api/v1/cuotas/:cuotaId/pagos | Paga la cuota con la pasarela simulada. Recibe `idempotencyKey`, `cardNumber`, `expMonth`, `expYear`, `cvv` y `holderName`. Responde 201 con `status` APROBADO o RECHAZADO; con una `idempotencyKey` ya usada en esa cuota responde 200 con el mismo pago. Una cuota ya pagada responde 409 (H1) | Residente |
| GET | /api/v1/cuotas/:cuotaId/pagos | Intentos de pago de una cuota, del más reciente al más antiguo (H2) | Residente, Administrador |
| GET | /api/v1/pagos/:pagoId | Recibo de un pago. El residente solo ve los de su unidad (H1) | Residente, Administrador |
| GET | /api/v1/unidades/:unitId/estado-cuenta | Estado de cuenta de cualquier unidad, en solo lectura, con los mismos filtros (H2) | Administrador |
| GET | /api/v1/admin/unidades/:unitId | Unidad con su torre, su código de registro y sus residentes (H2) | Administrador |
| POST | /api/v1/admin/unidades/:unitId/codigo-registro | Regenera el código de registro de la unidad. El anterior deja de servir (H2) | Administrador |
| GET | /api/v1/cuotas/generaciones/vista-previa | Unidades activas del periodo y cuántas recibirían cuota (H3) | Administrador |
| POST | /api/v1/cuotas/generaciones | Genera las cuotas del periodo para las unidades activas; omite las que ya tienen cuota de ese periodo (H3) | Administrador |
| GET | /api/v1/cuotas/generaciones | Historial de generaciones, la más reciente primero (H3) | Administrador |
| GET | /api/v1/morosidad | Unidades con cuotas en Moroso: resumen, monto, "Moroso desde" y días en mora. Filtros `towerId` y `search`, 20 por página (H4) | Administrador |
| POST | /api/v1/cuotas/tareas/ejecutar | Corre en el momento las tareas de mora y de recordatorios, con las mismas reglas que el horario. Responde `markedOverdue` y `remindersSent` (H5) | Administrador |

Las tareas de H5 también corren solas todos los días, en hora de El Salvador: el paso a Moroso a las 00:05 y los recordatorios a las 08:00.

La pasarela de H1 es simulada y responde después de `PAYMENT_GATEWAY_DELAY_MS` milisegundos (2000 por defecto). La tarjeta `4242424242424242` se aprueba, la `4000000000000002` se rechaza por fondos insuficientes y cualquier otra se rechaza como no reconocida. Solo se guardan los últimos 4 dígitos de la tarjeta.

### Módulo 2: Reservas de áreas comunes

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| GET | /api/v1/areas | Áreas habilitadas, por nombre, con aforo, horario, duración de la franja y reglas (H6, H7) | Residente, Administrador |
| GET | /api/v1/areas/:areaId/disponibilidad | Franjas del área en `date` (de hoy a 30 días) con su estado: DISPONIBLE, RESERVADO, MANTENIMIENTO o PASADO, y si la reservó la unidad del usuario (H6) | Residente, Administrador |
| POST | /api/v1/reservas | Reserva una franja para la unidad del residente. Recibe `areaId`, `date`, `startTime`, `attendees` y `acceptRules: true`. Franja ocupada, área deshabilitada o bloqueada, o la unidad con 2 reservas activas responde 409 (H7) | Residente |
| GET | /api/v1/reservas/mias | Reservas de la unidad. Filtro `tab` (`proximas` o `historial`), 10 por página (máximo 50). Cada fila indica si se puede cancelar (H8) | Residente |
| PATCH | /api/v1/reservas/:id/cancelar | Cancela una reserva de la unidad. Con menos de 24 horas de anticipación o ya cancelada responde 409 (H8) | Residente |
| GET | /api/v1/admin/areas | Todas las áreas, con sus reservas futuras y sus bloqueos actuales y futuros (H9) | Administrador |
| POST | /api/v1/admin/areas | Crea un área. Un nombre repetido responde 409 (H9) | Administrador |
| PATCH | /api/v1/admin/areas/:id | Edita un área o la deshabilita con `isActive: false` (H9) | Administrador |
| POST | /api/v1/admin/areas/:id/bloqueos | Bloquea el área por mantenimiento entre `startDate` y `endDate` (hasta 90 días) con un `reason` (H9) | Administrador |
| DELETE | /api/v1/admin/areas/:id/bloqueos/:bloqueoId | Elimina un bloqueo. Responde 204 y no restaura las reservas canceladas (H9) | Administrador |

Si la edición o el bloqueo cancela reservas confirmadas, el backend responde 409 con `code: "RESERVAS_AFECTADAS"` y `affectedCount`. Para aplicarlo hay que repetir la petición con `confirmCancellations: true`. Las reservas afectadas pasan a CANCELADA_ADMIN y cada residente recibe una notificación con el motivo.

### Módulo 3: Incidencias y mantenimiento

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/incidencias | Registra una incidencia con título (5 a 80 caracteres), descripción (10 a 1,000), ubicación, referencia opcional y de 1 a 3 fotos JPG o PNG de hasta 5 MB, en `multipart/form-data`. Queda Pendiente y con prioridad Media (H10) | Residente |
| GET | /api/v1/incidencias/mias | Incidencias de la unidad del residente, la más reciente primero (H11) | Residente |
| GET | /api/v1/incidencias/:id | Detalle con fotos, responsable e historial. Una incidencia de otra unidad responde 404 (H11) | Residente, Administrador |
| GET | /api/v1/incidencias/fotos/:fotoId | Archivo de una fotografía de la incidencia (H10, H11) | Residente, Administrador |
| GET | /api/v1/admin/incidencias | Todas las incidencias, por prioridad (Alta, Media, Baja) y antigüedad. Filtros `status`, `priority`, `location`, `assigneeId` y `search`, 20 por página (H12) | Administrador |
| GET | /api/v1/admin/responsables | Responsables de mantenimiento activos (H12) | Administrador |
| PATCH | /api/v1/admin/incidencias/:id | Cambia la prioridad o el responsable y guarda el evento en el historial. Una incidencia Resuelto responde 409 (H12) | Administrador |
| POST | /api/v1/admin/incidencias/:id/estado | Avanza el estado (Pendiente → En proceso → Resuelto, o reabre) con una observación de 10 a 500 caracteres y notifica al residente. Sin responsable o con el estado ya cambiado responde 409 (H13) | Administrador |

### Módulo 4: Control de acceso de visitas

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/visitas | Preautoriza un visitante para una fecha de hoy a 30 días, con hora estimada en pasos de 15 minutos. Devuelve un código de 6 caracteres válido ese día de 06:00 a 22:00. Un visitante con autorización para esa fecha responde 409 (H14) | Residente |
| GET | /api/v1/visitas/mias | Visitas de la unidad en dos pestañas: `activas` (pendientes de autorización y autorizadas) e `historial`, 10 por página (H15) | Residente |
| PATCH | /api/v1/visitas/:id/cancelar | Cancela una visita Autorizada. Otro estado responde 409 (H15) | Residente |
| POST | /api/v1/visitas/:id/respuesta | Aprueba o rechaza (con motivo opcional) una solicitud de portería y notifica a seguridad. Sin respuesta en 15 minutos, la solicitud se rechaza sola. Si otro residente ya respondió, 409 (H15) | Residente |
| GET | /api/v1/seguridad/visitas/buscar | Busca visitas de hoy por código de 6 caracteres o número de documento (H16) | Personal de seguridad |
| POST | /api/v1/seguridad/visitas/solicitudes | Pide autorización a la unidad para un visitante sin aviso y notifica a sus residentes. Una unidad sin residentes o fuera de 06:00 a 22:00 responde 409 (H16) | Personal de seguridad |
| GET | /api/v1/seguridad/visitas/solicitudes | Solicitudes de hoy con su estado, la más reciente primero (H16) | Personal de seguridad |
| POST | /api/v1/seguridad/visitas/:id/entrada | Registra la entrada de una visita Autorizada y vigente; pasa a Dentro. Fuera de vigencia, en otro estado o con el visitante ya dentro responde 409 (H16) | Personal de seguridad |
| POST | /api/v1/seguridad/visitas/:id/salida | Registra la salida de una visita Dentro; pasa a Finalizada con la hora del servidor y el agente. Si no está Dentro, o si otro agente ya registró la salida, responde 409 con "Este visitante no tiene una entrada activa." (H17) | Personal de seguridad |
| GET | /api/v1/seguridad/visitas/dentro | Visitas en estado Dentro sin importar la fecha, la entrada más antigua primero, con `minutesInside` calculado en el servidor y `totalInside` del condominio. Filtros `towerId` y `search` (nombre o documento, máximo 80, sin distinguir mayúsculas ni tildes); 50 por página, máximo 100 (H18) | Personal de seguridad |

### Módulo 5: Paquetería

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/seguridad/paquetes | Registra la llegada de un paquete para una unidad con residentes activos. Genera el código `PQ-AAAAMMDD-NNNN` y notifica a los residentes de la unidad. Una unidad sin residentes activos responde 409 (H19) | Personal de seguridad |
| GET | /api/v1/seguridad/paquetes | Paquetes del más reciente al más antiguo. Filtros `status`, `towerId`, `unitId` y `search` (código, guía o unidad); 20 por página (H19) | Personal de seguridad |
| POST | /api/v1/seguridad/paquetes/:id/entrega | Entrega un paquete Pendiente con el nombre y el documento (DUI o pasaporte) de quien recoge, y notifica a la unidad. Si ya fue entregado responde 409 con la fecha y el nombre; si no existe, 404 (H21) | Personal de seguridad |
| GET | /api/v1/paquetes/mios | Paquetes de la unidad del residente por `status`, con `pendingCount` y los días de espera. De quien recogió solo muestra los últimos 4 caracteres del documento; 10 por página (H20) | Residente |

### Módulo 6: Asambleas y votaciones

| Método | Ruta | Descripción | Roles |
|---|---|---|---|
| POST | /api/v1/admin/asambleas | Convoca una asamblea Programada con 1 a 10 temas de 2 a 6 opciones. El inicio va al menos 1 hora después de ahora y el cierre, entre 1 hora y 14 días después del inicio (H22) | Administrador |
| GET | /api/v1/admin/asambleas | Asambleas de la más reciente a la más antigua, con temas y unidades que votaron. Filtro `status`; 10 por página, máximo 50 (H22) | Administrador |
| GET | /api/v1/admin/asambleas/:id | Detalle de una asamblea con sus temas y opciones (H22) | Administrador |
| PUT | /api/v1/admin/asambleas/:id | Edita una asamblea Programada y reemplaza sus temas. Abierta o Cerrada responde 409 (H22) | Administrador |
| DELETE | /api/v1/admin/asambleas/:id | Elimina una asamblea Programada. Abierta o Cerrada responde 409 (H22) | Administrador |
| GET | /api/v1/asambleas/activas | Asambleas Abiertas donde la unidad está habilitada, el cierre más cercano primero, con los temas que ya votó la unidad (H23) | Residente |
| GET | /api/v1/asambleas/:id | Detalle para votar, con el estado de voto de la unidad en cada tema, sin la opción elegida. Una unidad no habilitada recibe 404 (H23) | Residente |
| POST | /api/v1/asambleas/temas/:temaId/votos | Emite el voto de la unidad. Participación y voto se guardan por separado en una transacción para que el voto sea secreto. Ya votado, o asamblea no Abierta o pasada su hora de cierre, responde 409; unidad no habilitada, 403 (H23) | Residente |
| GET | /api/v1/asambleas/:id/resultado | Resultado por tema. Los conteos (`totalVotes`, `votes`, `pct`) solo salen con la asamblea Cerrada y vienen de `topic_results`, calculado al cierre (H24) | Administrador, Residente |
| GET | /api/v1/asambleas/temas/:temaId/participacion | Unidades que votaron el tema y su hora, sin la opción elegida; 50 por página (H24) | Administrador, Residente |
| GET | /api/v1/asambleas/cerradas | Asambleas Cerradas, la más reciente primero; 10 por página (H24) | Residente |

Una tarea automática corre cada minuto. Abre las asambleas Programadas que llegaron a su inicio, fija las unidades habilitadas y avisa a los residentes. Cierra las Abiertas que llegaron a su cierre y guarda el resultado de cada tema en la misma transacción.

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
