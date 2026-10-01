# Two programs in one image: the web server, which `CMD` starts, and the map
# renderer, started instead as `node map-renderer/index.mjs` - the way the API
# image runs its worker with `arq`.
#
# Ubuntu 24.04 rather than Alpine, for the renderer: MapLibre Native ships Linux
# binaries for Ubuntu 24.04 and nothing else, and Debian's and Alpine's library
# names differ from the ones it links. Node is the official build, copied out of
# the official image rather than installed from a third-party apt repository,
# so one floating tag decides it. Both build stages share the base, so what
# `npm ci` installs is what runs.
FROM node:24-bookworm-slim AS node

FROM ubuntu:24.04 AS base
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app

# Build the application
#
# No separate production-deps stage: `output: "standalone"` (next.config.js)
# makes the build emit its own pruned `node_modules` into `.next/standalone`,
# which is what the runner copies, and the map renderer's build gathers the two
# native packages it loads into its own. A `npm ci --only=production` stage
# would be built on every image and then never used by anything.
FROM base AS builder
ARG DEBIAN_FRONTEND=noninteractive
# The certificates are for `npm ci`, and for the binary MapLibre Native's install
# script downloads from its GitHub release.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY package*.json ./
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

# Build the Next.js application, and the map renderer beside it
RUN npm run build

# Production image
FROM base AS runner
ARG DEBIAN_FRONTEND=noninteractive

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# `upgrade` as well as `install`, because a rebuild has to collect the Ubuntu
# security updates published since `ubuntu:24.04` was last cut - which is also
# why Publish Image never takes this stage from its build cache.
#
# What MapLibre Native links against, and the X server it draws through: its
# Linux binary renders with GLX, so even a renderer with no screen needs one,
# and Mesa's software rasteriser is the GPU. The web server uses none of it.
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends \
    libcurl4t64 libicu74 libjpeg-turbo8 libpng16-16t64 libuv1t64 libwebp7 \
    libopengl0 libglx0 libglx-mesa0 libgl1-mesa-dri libx11-6 libxext6 \
    xvfb \
  && rm -rf /var/lib/apt/lists/* \
  # Where Xvfb puts its socket, made once by root so the renderer, which is not
  # root, finds it already there.
  && mkdir -m 1777 /tmp/.X11-unix

# Create a non-root user
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# The licences travel with the image, not just with the repository. AGPL-3.0 asks
# that the notice reach every copy conveyed, and NOTICE.md carries the third-party
# terms for the artwork and vendored builds baked into this one - an operator who
# only ever pulls the image would otherwise receive neither.
COPY --from=builder /app/LICENSE /app/NOTICE.md ./

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/build/map-renderer ./map-renderer

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Node's own `fetch` rather than curl or wget: this image carries neither, and
# installing one to ask a question the runtime can already ask is a package and a CVE
# surface for nothing. Written in exec form, so no shell is involved and the builder
# performs no substitution on it - `process.env.PORT` is read by node at run time, which
# keeps the check right for an instance that moved the port. The map renderer answers
# `/healthz` on the same `PORT`, so the one check serves either command.
#
# `--start-period` is what stops a slow first boot from counting as failures: within it a
# failing check delays `healthy` rather than counting toward `--retries`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Start the application
CMD ["node", "server.js"]
