# Use the official Node.js runtime as the base image
FROM node:24-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Build the application
#
# No separate production-deps stage: `output: "standalone"` (next.config.js)
# makes the build emit its own pruned `node_modules` into `.next/standalone`,
# which is what the runner copies. A `npm ci --only=production` stage would be
# built on every image and then never used by anything.
FROM base AS builder
RUN npm ci
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# An override, not a requirement. Left unset - which is how the published image is
# built - the bundle calls the relative `/api/v1` and this app's own route handler
# forwards it to `API_INTERNAL_URL`, a variable read at *runtime*. That is what makes one
# image work on any domain.
#
# Supply it (`--build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1` - the full
# base, `/api/v1` prefix included) only for a split-origin deployment where the browser
# should reach the API directly. `NEXT_PUBLIC_*` values are inlined into the client bundle
# at build time, so a rebuild is the only way to change it afterwards - the whole reason
# it is no longer the default path.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the Next.js application
RUN npm run build

# Production image
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Node's own `fetch` rather than curl or wget: this image is `node:24-alpine`, which
# carries neither, and installing one to ask a question the runtime can already ask is a
# package and a CVE surface for nothing. Written in exec form, so no shell is involved and
# the builder performs no substitution on it - `process.env.PORT` is read by node at run
# time, which keeps the check right for an instance that moved the port.
#
# `--start-period` is what stops a slow first boot from counting as failures: within it a
# failing check delays `healthy` rather than counting toward `--retries`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Start the application
CMD ["node", "server.js"]
