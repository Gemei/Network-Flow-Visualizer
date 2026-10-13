FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client and build project
RUN npx prisma generate
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
# Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Use the client generated during the build, not a second install.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# The CLI is a devDependency, so standalone output has no `prisma` binary.
# Install it with its own dependency tree; the app keeps the generated client above.
RUN npm install --prefix /opt/prisma-cli prisma@6.19.2 && chmod -R a+rX /opt/prisma-cli

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# SQLite file lives on the volume, not beside the schema.
# Owned by nextjs so the named volume is writable when mounted.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Writable HOME for the npx/prisma cache under the non-root user
RUN mkdir -p /home/nextjs && chown nextjs:nodejs /home/nextjs

EXPOSE 3000
ENV PORT 3000
# Docker sets HOSTNAME to the container id. Next.js standalone binds to that
# name only, so a check against 127.0.0.1 fails while the app is healthy.
ENV HOSTNAME=0.0.0.0

ENV DATABASE_URL="file:/app/data/dev.db"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Run as the non-root user
USER nextjs
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]