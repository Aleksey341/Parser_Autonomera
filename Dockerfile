# ===== Build stage =====
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Только для npm-установки
COPY package*.json ./
# Предпочтительно: npm ci, fallback: npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ===== Runtime stage =====
FROM node:20-bookworm-slim
WORKDIR /app

# Библиотеки для системного Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      libnss3 libnspr4 \
      libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 \
      libxfixes3 libxrandr2 libxrender1 libxshmfence1 \
      libatk-bridge2.0-0 libgtk-3-0 libdrm2 libgbm1 \
      libpango-1.0-0 libpangocairo-1.0-0 libcairo2 \
      libasound2 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-global-webcrypto
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer
# (опционально) чтобы не падал sandbox — снимите, если запускаете как non-root
ENV CHROMIUM_FLAGS="--no-sandbox --disable-dev-shm-usage"

# Если хотите non-root:
# RUN useradd -m -u 1001 pptr && mkdir -p /tmp/puppeteer && chown -R pptr:pptr /app /tmp/puppeteer
# USER pptr

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
