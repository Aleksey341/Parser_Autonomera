# ===== Build stage =====
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
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

COPY package*.json ./
# без lock-файла используем npm install
RUN npm install --omit=dev

# ===== Runtime stage =====
FROM node:20-bookworm-slim
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
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

# Cache bust to force rebuild (2025-10-23 22:05)
COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
