# Build stage
FROM node:20-slim as builder

WORKDIR /app

# Install Chromium
RUN apt-get update && apt-get install -y chromium-browser && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Runtime stage
FROM node:20-slim

WORKDIR /app

# Install Chromium
RUN apt-get update && apt-get install -y chromium-browser && rm -rf /var/lib/apt/lists/*

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS=--experimental-global-webcrypto
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_CACHE_DIR=/tmp/puppeteer

# Start server
CMD ["node", "server.js"]
