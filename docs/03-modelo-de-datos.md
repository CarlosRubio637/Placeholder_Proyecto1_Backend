<!-- Reemplacen todo el texto entre corchetes y borren estos comentarios antes de entregar. -->

# Modelo de datos

## Diagrama entidad-relación

```mermaid
erDiagram
    USUARIO ||--o{ RESERVA : realiza
    AREA ||--o{ RESERVA : "se reserva en"
    USUARIO {
        int id PK
        string correo
        string rol
    }
    RESERVA {
        int id PK
        int usuario_id FK
        int area_id FK
        datetime inicio
        datetime fin
    }
    AREA {
        int id PK
        string nombre
    }
```

## Tablas

| Tabla | Descripción | Campos importantes |
|---|---|---|
| [usuario] | [...] | [...] |
