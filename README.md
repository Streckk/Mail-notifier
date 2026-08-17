# Headphones Mail Notifier

Servicio mínimo en Node.js + TypeScript que envía **una vez al día** el correo de
notificación/autorización para ingresar audífonos al lugar de trabajo. Como esa
autorización tiene una vigencia de 24 horas, el correo se renueva
automáticamente cada día a la hora configurada.

No hay servidor HTTP, ni base de datos, ni cola: solo un proceso que duerme y
envía un correo cuando toca.

El envío va por **Microsoft Graph**. Nodemailer se conserva para construir el
mensaje —genera el MIME con las partes HTML y texto plano— y Graph lo entrega.
Se descartó SMTP porque el tenant tiene SMTP AUTH deshabilitado a nivel global
(`535 5.7.139`), lo que lo bloquea con contraseña y con OAuth2 por igual.

## Requisitos

- Node.js 20 o superior (probado con Node 24)
- Una app registrada en Entra ID con el permiso de aplicación **`Mail.Send`** de
  Microsoft Graph y consentimiento de administrador
- Opcional: Docker

## Instalación

```bash
npm install
cp .env.example .env
# edita .env con tus credenciales reales
```

## Variables de entorno

| Variable                 | Obligatoria | Default                                | Descripción                                                       |
| ------------------------ | ----------- | -------------------------------------- | ----------------------------------------------------------------- |
| `AZURE_TENANT_ID`        | Sí          | —                                      | Directory (tenant) ID de Entra ID.                                 |
| `AZURE_CLIENT_ID`        | Sí          | —                                      | Application (client) ID de la app registrada.                      |
| `AZURE_CLIENT_SECRET`    | Sí          | —                                      | Client secret. Nunca se imprime en logs.                           |
| `MAIL_FROM`              | Sí          | —                                      | Remitente y buzón emisor. Admite `"Nombre <correo@dominio>"`.      |
| `MAIL_TO`                | Sí          | —                                      | Destinatario(s). Varios separados por coma.                        |
| `MAIL_SUBJECT`           | No          | `Autorización de ingreso de audífonos` | Asunto del correo.                                                 |
| `MAIL_DRY_RUN`           | No          | `false`                                | `true` muestra el correo en consola sin enviarlo ni llamar a Graph.|
| `EMPLOYEE_NAME`          | No          | `Colaborador`                          | Nombre mostrado en la plantilla.                                   |
| `EMPLOYEE_DEPARTMENT`    | No          | vacío                                  | Área; si se deja vacío, la línea no aparece.                       |
| `DEVICE_TYPE`            | No          | `Audífonos personales`                 | Tipo de dispositivo.                                               |
| `DEVICE_BRAND`           | No          | vacío                                  | Marca; si se deja vacío, la línea no aparece.                      |
| `DEVICE_MODEL`           | No          | vacío                                  | Modelo; si se deja vacío, la línea no aparece.                     |
| `DEVICE_COLOR`           | No          | vacío                                  | Color; si se deja vacío, la línea no aparece.                      |
| `DEVICE_SERIAL`          | No          | vacío                                  | Número de serie; si se deja vacío, la línea no aparece.            |
| `CRON_EXPRESSION`        | No          | `0 8 * * *`                            | Horario del envío en formato cron.                                 |
| `TIMEZONE`               | No          | `America/Monterrey`                    | Zona horaria IANA usada por el cron y por los logs.                |
| `DUPLICATE_GUARD`        | No          | `daily`                                | `daily` = un envío por día; `off` = sin guarda diaria.             |
| `VERIFY_ON_STARTUP`      | No          | `true`                                 | Verifica el acceso a Graph al arrancar (no detiene el servicio).   |
| `MONGODB_URI`            | No          | vacío                                  | Cadena de conexión. Sin ella, el servicio corre sin bitácora.      |
| `MONGODB_DB`             | No          | `headphones_notifier`                  | Base de datos donde vive la colección `notifications`.             |

La configuración se valida al arrancar: si falta una variable obligatoria, o el
cron o la zona horaria son inválidos, el proceso falla de inmediato con un
mensaje claro en lugar de quedarse corriendo sin enviar nada.

## Cómo autentica

El servicio pide un access token a Entra ID con el flujo `client_credentials`
(scope `https://graph.microsoft.com/.default`) y lo cachea hasta 5 minutos antes
de que caduque. Después hace `POST /users/{buzón}/sendMail` con el MIME en
base64. Ni el client secret ni el token aparecen nunca en los logs.

El único requisito en Microsoft es que la app registrada tenga el permiso de
aplicación **`Mail.Send` de Microsoft Graph** con consentimiento de
administrador. Para comprobarlo sin enviar nada, pide un token con ese scope y
decodifica el claim `roles`: debe contener `Mail.Send`. Si sale vacío, falta el
permiso o el consentimiento.

Nota sobre el alcance: `Mail.Send` como permiso de aplicación permite enviar
desde cualquier buzón del tenant. Si eso es más de lo necesario, se acota con una
[ApplicationAccessPolicy](https://learn.microsoft.com/graph/auth-limit-mailbox-access)
al buzón que use `MAIL_FROM`.

### Por qué no SMTP

SMTP quedó descartado porque el tenant tiene SMTP AUTH deshabilitado a nivel
global:

```text
535 5.7.139 Authentication unsuccessful, SmtpClientAuthentication is disabled for the Tenant.
```

Ese flag bloquea **todo** el SMTP AUTH, también el que usa OAuth2, y afecta a
todos los buzones. Habilitarlo requiere que un administrador ejecute
`Set-CASMailbox -SmtpClientAuthenticationEnabled $true` por buzón, además de
otorgar `SMTP.SendAsApp` y registrar el service principal en Exchange Online.
Graph no usa SMTP AUTH, así que nada de eso hace falta.

## Ejecutar localmente

```bash
npm run dev     # modo desarrollo, recarga al guardar
```

Al arrancar verás:

```text
[2026-08-17 09:12:39] Servicio de autorización de audífonos iniciado
[2026-08-17 09:12:39] Timezone: America/Monterrey
[2026-08-17 09:12:39] Próximo envío configurado mediante: 0 8 * * *
[2026-08-17 09:12:39] Destinatarios: seguridad@example.com
[2026-08-17 09:12:39] Guarda anti-duplicados: daily
[2026-08-17 09:12:39] Remitente: usuario@example.com (vía Microsoft Graph)
[2026-08-17 09:12:39] Acceso a Microsoft Graph verificado
[2026-08-17 09:12:39] Próxima ejecución programada: 2026-08-18 08:00:00
```

Y en cada envío:

```text
[2026-08-18 08:00:00] Iniciando envío de autorización de audífonos
[2026-08-18 08:00:02] Correo enviado correctamente a seguridad@example.com (messageId: <...>)
```

o, si falla:

```text
[2026-08-18 08:00:02] Error enviando correo: Graph rechazó el envío (HTTP 403: ErrorAccessDenied)
[2026-08-18 08:00:02] El servicio continúa activo; se reintentará en la próxima ejecución programada
```

## Envío manual de prueba

```bash
npm run send:test
```

Usa exactamente las mismas credenciales, la misma plantilla y la misma función de
envío que el cron. No arranca el scheduler y **omite** la guarda diaria a
propósito, para poder probar cuantas veces haga falta. Sale con código `1` si el
envío falla.

Dentro de un contenedor o sobre el código ya compilado:

```bash
npm run send:test:dist
```

### Simulacro (sin enviar nada)

Para validar plantilla, horarios y logs sin llamar a Graph —útil mientras se
resuelven permisos, o para no molestar a los destinatarios—:

```bash
MAIL_DRY_RUN=true npm run send:test        # un envío simulado
MAIL_DRY_RUN=true npm run dev              # el servicio completo, con cron
```

Arma el correo real y lo imprime, pero no llama a Graph ni valida credenciales.
Los logs lo
marcan con `SIMULACRO` para que no se confunda con un envío de verdad.

Para no esperar al cron, node-cron acepta un sexto campo de segundos:

```bash
MAIL_DRY_RUN=true CRON_EXPRESSION="*/5 * * * * *" npm run dev
```

## Compilar

```bash
npm run build      # genera dist/
npm start          # ejecuta dist/index.js
npm run typecheck  # solo verifica tipos, sin generar archivos
```

## Docker

```bash
docker build -t headphones-mail-notifier .

docker run -d --name headphones-mail \
  --init \
  --restart unless-stopped \
  --env-file .env \
  --memory 256m \
  --log-opt max-size=10m --log-opt max-file=3 \
  headphones-mail-notifier
```

Qué hace cada bandera:

| Bandera | Para qué |
| ------- | -------- |
| `--init` | Node corre como PID 1; sin esto no hay reaper de zombis. Las señales ya se manejan en el código, pero es la práctica correcta. |
| `--restart unless-stopped` | Levanta el contenedor tras un reinicio del host, pero respeta un `docker stop` manual. |
| `--memory 256m` | El proceso usa ~60 MB. El límite evita que una fuga se coma la RAM de una instancia chica. |
| `--log-opt max-size` | Sin esto los logs de Docker crecen sin límite y con los meses llenan el disco. |

Envío manual dentro del contenedor:

```bash
docker exec headphones-mail node dist/sendTest.js
```

Logs:

```bash
docker logs -f --tail 50 headphones-mail
```

### Zona horaria

El contenedor corre con el reloj del sistema en **UTC** a propósito. La hora del
envío no depende de ese reloj sino de la variable `TIMEZONE`, que node-cron
resuelve explícitamente. El servidor puede estar en UTC y el correo igual sale a
las 8:00 AM hora de Monterrey.

### Despliegue en EC2

Compila la imagen **en la propia instancia**, no en tu equipo: si tu máquina es
x86 y la instancia es ARM (`t4g`), la imagen no arranca.

```bash
# en la EC2
sudo dnf install -y docker git          # Amazon Linux 2023
sudo systemctl enable --now docker
sudo usermod -aG docker $USER           # cierra y reabre la sesión

git clone https://github.com/Streckk/Mail-notifier.git
cd Mail-notifier
```

El `.env` no está en el repo: créalo en la instancia a partir de `.env.example` y
restringe sus permisos, porque contiene el client secret.

```bash
cp .env.example .env
nano .env
chmod 600 .env
```

Comprueba la configuración sin enviar nada antes de dejarlo corriendo:

```bash
docker build -t headphones-mail-notifier .
docker run --rm --env-file .env -e MAIL_DRY_RUN=true \
  headphones-mail-notifier node dist/sendTest.js
```

Si la vista previa se ve bien, arranca el servicio con el `docker run` de arriba.

Para actualizar tras un cambio en el repo:

```bash
git pull && docker build -t headphones-mail-notifier . \
  && docker rm -f headphones-mail && docker run -d ...   # mismas banderas
```

## Cambiar el horario

Edita `CRON_EXPRESSION` en el `.env` y reinicia el servicio. Formato de 5 campos
(`minuto hora día-del-mes mes día-de-semana`):

| Expresión      | Significado                       |
| -------------- | --------------------------------- |
| `0 8 * * *`    | Todos los días a las 8:00 AM      |
| `30 7 * * *`   | Todos los días a las 7:30 AM      |
| `0 8 * * 1-5`  | Lunes a viernes a las 8:00 AM     |
| `0 6,18 * * *` | Dos veces al día, 6:00 AM y 6:00 PM |

Ojo: con `DUPLICATE_GUARD=daily` (el default) solo se permite **un envío
exitoso por día calendario**. Si configuras más de un envío diario —como en el
último ejemplo, o con un cron tipo `*/10 * * * *`— pon también
`DUPLICATE_GUARD=off`, o el servicio descartará todos los disparos posteriores
al primero de cada día.

## Cambiar la zona horaria

Edita `TIMEZONE` con cualquier identificador IANA válido y reinicia:

```env
TIMEZONE=America/Mexico_City
```

Afecta tanto al disparo del cron como al timestamp de los logs y a la vigencia
mostrada en el correo. Si el valor no es una zona horaria válida, el servicio no
arranca.

## Cambiar el contenido del correo

Todo el texto y el HTML viven en `src/templates/headphonesEmail.ts`. Ni el
scheduler ni el cliente de Graph saben nada del contenido, así que puedes editar
la plantilla sin tocar el resto.

## Estructura

```text
src/
├── config/
│   └── env.ts                        # carga y valida la configuración
├── mail/
│   ├── graphClient.ts                # token de Entra ID + envío por Graph
│   └── sendHeadphonesNotification.ts # única función de envío
├── scheduler/
│   └── dailyNotification.ts          # cron diario + prevención de duplicados
├── db/
│   └── notificationLog.ts            # bitácora de envíos en MongoDB (opcional)
├── templates/
│   └── headphonesEmail.ts            # HTML y texto plano
├── utils/
│   ├── logger.ts                     # logs con timestamp en la TZ configurada
│   └── time.ts                       # formateo y comparación por zona horaria
├── index.ts                          # arranque del servicio
└── sendTest.ts                       # envío manual de prueba
```

## Bitácora en MongoDB

Es opcional. Con `MONGODB_URI` configurada, cada intento de envío deja un
documento en la colección `notifications`:

| Estado    | Significado                                              |
| --------- | -------------------------------------------------------- |
| `pending` | El recordatorio se creó y el envío está en curso.          |
| `sent`    | Graph aceptó el correo. Guarda `sentAt` y `messageId`.     |
| `failed`  | El envío falló. Guarda el motivo en `error`.               |

Cada documento incluye además `dayKey` (el día calendario en la zona horaria
configurada), `recipients`, `subject`, `attemptedAt`, y `trigger`, que distingue
los envíos del cron (`scheduled`) de los manuales (`manual`).

Un documento que se queda en `pending` indica que el proceso murió a mitad del
envío: el correo pudo haber salido o no.

Consultas útiles:

```js
// últimos 10 intentos
db.notifications.find().sort({ attemptedAt: -1 }).limit(10)

// fallos con su motivo
db.notifications.find({ status: 'failed' }, { dayKey: 1, error: 1 })

// ¿se envió hoy?
db.notifications.countDocuments({ dayKey: '2026-08-18', status: 'sent' })
```

### La bitácora nunca bloquea el envío

El correo es la función principal; la bitácora es contabilidad. Si Mongo está
caído o la URI es inválida, el servicio lo registra y **sigue enviando**, con la
guarda anti-duplicados en memoria como respaldo. Verificado: sin `MONGODB_URI`
arranca normal, y con una URI inalcanzable avisa y continúa.

## Prevención de duplicados

Dos capas, ambas en memoria y sin dependencias externas:

1. **`noOverlap: true`** de node-cron: si un envío sigue en curso cuando llega la
   siguiente ejecución programada, esa ejecución se omite (queda registrada en
   los logs).
2. **Guarda por día calendario** (`DUPLICATE_GUARD=daily`, default): antes de
   enviar se comprueba si ya existe un envío exitoso con ese `dayKey`. Si hay
   bitácora en MongoDB la respuesta sale de ahí, así que **la guarda sobrevive a
   reinicios del contenedor**; si no, se usa el estado en memoria. Un segundo
   intento el mismo día se omite y se registra. Si el envío falla, el día **no**
   se marca, de modo que un reintento sigue siendo posible. Con
   `DUPLICATE_GUARD=off` esta capa se desactiva y cada disparo del cron envía;
   `noOverlap` sigue activo.

### ¿Y si corrieran varias instancias?

Con la bitácora en MongoDB compartida, dos instancias sí se ven entre sí: la
segunda consulta el `dayKey` y encuentra el envío de la primera. Eso **reduce**
mucho la ventana, pero no la cierra del todo — si ambas consultan al mismo tiempo
antes de que ninguna haya terminado de enviar, las dos ven "no enviado" y salen
dos correos.

Para una sola instancia, que es el caso actual, no hay problema. Si algún día
hicieran falta réplicas, la solución es un índice único parcial que haga
imposible el segundo envío a nivel de base de datos:

```js
db.notifications.createIndex(
  { dayKey: 1 },
  { unique: true, partialFilterExpression: { status: 'sent' } },
)
```

Con eso, el `updateOne` que marca `sent` en la segunda instancia falla con error
de clave duplicada y queda constancia de que otra ya envió. Ojo: ese índice es
incompatible con `DUPLICATE_GUARD=off`, porque impide más de un envío exitoso
por día.

La alternativa es `distributed: true` de node-cron 4 con un `runCoordinator`
apoyado en la misma colección.
