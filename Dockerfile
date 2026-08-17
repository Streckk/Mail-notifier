# --- Etapa de compilación ---------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

# Se copian solo los manifiestos primero: mientras no cambien, Docker reutiliza
# la capa de dependencias y no vuelve a instalar en cada build.
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Etapa de ejecución ------------------------------------------------------
FROM node:24-alpine AS runner

# tzdata para resolver zonas horarias IANA dentro del contenedor.
RUN apk add --no-cache tzdata

WORKDIR /app

# El reloj del contenedor queda en UTC a propósito: la hora del envío la decide
# la variable TIMEZONE de la aplicación, no el reloj del sistema. Así el
# servicio se comporta igual en una EC2 en UTC que en una laptop en Monterrey.
#
# --enable-source-maps hace que los stack traces apunten al .ts original.
ENV NODE_ENV=production \
    TZ=UTC \
    NODE_OPTIONS=--enable-source-maps

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node

# Arráncalo con `docker run --init` para que las señales lleguen bien y no
# queden procesos zombis: el proceso de Node corre como PID 1.
CMD ["node", "dist/index.js"]
