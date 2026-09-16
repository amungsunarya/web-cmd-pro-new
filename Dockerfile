# ---------- Stage 1: Build backend deps ----------
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev


# ---------- Stage 2: Runtime ----------
FROM node:20-alpine

RUN apk add --no-cache \
        iputils \
        busybox-extras \
        curl \
        tini \
        iperf3 \
        libstdc++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy backend
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY backend ./backend

# Copy frontend
COPY frontend ./frontend

# Buat folder data
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/app.db

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "backend/server.js"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/setup-status || exit 1