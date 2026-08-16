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

# `NEXT_PUBLIC_*` values are inlined into the client bundle at build time, not
# read at runtime - so this has to be supplied here, with
# `--build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1` - the full
# base, `/api/v1` prefix included - and a rebuild is the only way to change it.
# Without it the shipped bundle would call
# http://localhost:8000/api/v1 (the fallback in `lib/api/client.ts`) while
# `src/proxy.ts` reads the real value at runtime and writes a CSP naming a
# different origin - so the app would be blocked by its own CSP, in production
# only. The build fails below rather than shipping that.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the Next.js application
RUN test -n "$NEXT_PUBLIC_API_URL" || \
      (echo "ERROR: build-arg NEXT_PUBLIC_API_URL is required." >&2 && exit 1) && \
    npm run build

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

# Start the application
CMD ["node", "server.js"]
