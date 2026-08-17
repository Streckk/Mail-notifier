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
docker run -d --name headphones-mail --restart unless-stopped \
  --env-file .env \
  headphones-mail-notifier
```

Envío manual dentro del contenedor:

```bash
docker exec headphones-mail node dist/sendTest.js
```

El contenedor corre con el reloj del sistema en **UTC** a propósito. La hora del
envío no depende de ese reloj sino de la variable `TIMEZONE`, que node-cron
resuelve explícitamente. Es decir: el servidor puede estar en UTC y el correo
igual sale a las 8:00 AM hora de Monterrey, incluido el cambio de horario de
verano si llegara a aplicar.

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
├── templates/
│   └── headphonesEmail.ts            # HTML y texto plano
├── utils/
│   ├── logger.ts                     # logs con timestamp en la TZ configurada
│   └── time.ts                       # formateo y comparación por zona horaria
├── index.ts                          # arranque del servicio
└── sendTest.ts                       # envío manual de prueba
```

## Prevención de duplicados

Dos capas, ambas en memoria y sin dependencias externas:

1. **`noOverlap: true`** de node-cron: si un envío sigue en curso cuando llega la
   siguiente ejecución programada, esa ejecución se omite (queda registrada en
   los logs).
2. **Guarda por día calendario** (`DUPLICATE_GUARD=daily`, default): se recuerda
   el último día (`YYYY-MM-DD` en la zona horaria configurada) en que un envío
   terminó con éxito. Un segundo intento el mismo día se omite y se registra. Si
   el envío falla, el día **no** se marca, de modo que un reintento sigue siendo
   posible. Con `DUPLICATE_GUARD=off` esta capa se desactiva y cada disparo del
   cron envía; `noOverlap` sigue activo.

### ¿Y si corrieran varias instancias?

El estado vive en memoria de cada proceso, así que dos instancias no se ven
entre sí y enviarían **un correo cada una** a la misma hora: el destinatario
recibiría duplicados. Nada se rompe —no hay estado compartido que corromper—,
simplemente llegan copias.

Mientras el servicio corra en una sola instancia esto no es un problema, y por
eso no se agregó Redis ni una base de datos. Si algún día hiciera falta correr
varias réplicas, node-cron 4 ya trae `distributed: true` con un `runCoordinator`
conectable: se implementaría un lock compartido ahí, sin tocar el resto del
código.
