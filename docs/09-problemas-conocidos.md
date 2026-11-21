<!-- Cada responsable agrega las filas de sus historias. Borrar este comentario antes de entregar. -->

# Problemas conocidos

| Problema | Cómo se reproduce | Impacto | Historia relacionada |
|---|---|---|---|
| Las tareas automáticas de cuotas no corren si el backend está apagado a esa hora. En el plan gratuito el servicio se duerme tras un rato sin peticiones, y las tareas de las 00:05 y las 08:00 dependen de que esté despierto. | Dejar el backend sin peticiones antes de las 00:05 o de las 08:00 y revisar al día siguiente que las cuotas vencidas sigan en Pendiente y que no haya notificaciones nuevas. Mientras haya un monitor externo que llame al backend cada pocos minutos, las tareas corren a su hora. | Medio. Las cuotas pasan a Moroso y los recordatorios salen en la siguiente corrida, o al ejecutar `POST /api/v1/cuotas/tareas/ejecutar` como administrador. | H5 |
| En "Mis reservas" (`/reservas/mias`) el menú lateral marca a la vez "Áreas comunes" y "Mis reservas". | Entrar como residente y abrir "Mis reservas". | Bajo. Solo afecta el resaltado del menú; la navegación funciona. | H7, H8 |
