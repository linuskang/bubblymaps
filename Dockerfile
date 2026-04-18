# syntax=docker/dockerfile:1

# --- STAGE 1: Base ---
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Install OS dependencies for Linux (Prisma/OpenSSL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# --- STAGE 2: Dependencies ---
FROM base AS deps
ENV NODE_ENV=development

# Copy manifests
COPY package.json package-lock.json* ./
COPY prisma.config.ts ./
COPY src/prisma ./src/prisma

# FIX: Force npm to download Linux-compatible binaries regardless of 
# the host OS (Windows) that created the package-lock.json
RUN npm config set libc musl && \
    if [ -f package-lock.json ]; then npm ci; else npm install; fi

# --- STAGE 3: Builder ---
FROM base AS builder
ENV NODE_ENV=production
ENV SKIP_ENV_VALIDATION=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/public

# CRITICAL FIX: Ensure Linux lightningcss binary is present without dropping
# build-time devDependencies (e.g. @tailwindcss/postcss) needed by Next build.
RUN npm install --include=dev --os=linux --cpu=x64 lightningcss

# Generate Prisma and Build
RUN npx prisma generate --schema=./src/prisma/schema.prisma
RUN npm run build

# --- STAGE 4: Runner ---
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN groupadd -g 1001 nodejs \
    && useradd -r -u 1001 -g nodejs nextjs

# Copy Standalone Output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000), (res) => process.exit(res.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]