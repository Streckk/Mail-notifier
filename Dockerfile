# --- Etapa de compilación ---------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Etapa de ejecución -------------------------------------------------------
FROM node:24-alpine AS runner

# tzdata permite resolver zonas horarias IANA dentro del contenedor.
RUN apk add --no-cache tzdata

WORKDIR /app

# El reloj del contenedor queda en UTC a propósito: la hora del envío la decide
# la variable TIMEZONE de la aplicación, no el reloj del sistema.
ENV NODE_ENV=production \
    TZ=UTC

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node

CMD ["node", "dist/index.js"]
