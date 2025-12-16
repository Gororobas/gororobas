# syntax=docker.io/docker/dockerfile:1

FROM node:20-alpine AS base

# Set build arguments
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_SANITY_PROJECT_ID
ARG NEXT_PUBLIC_SANITY_DATASET
ARG SANITY_WRITE_TOKEN
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_SECRET
ARG MAILPIT_URL
ARG RESEND_API_KEY
ARG AUTH_WEBHOOK_SECRET
ARG GOOGLE_DATA_API_KEY
ARG HONEYCOMB_API_KEY
ARG HONEYCOMB_DATASET
ARG BLUESKY_USERNAME
ARG BLUESKY_PASSWORD
ARG VERCEL_DASHBOARD_URL

# Set environment variables for build
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_SANITY_PROJECT_ID=$NEXT_PUBLIC_SANITY_PROJECT_ID
ENV NEXT_PUBLIC_SANITY_DATASET=$NEXT_PUBLIC_SANITY_DATASET
ENV SANITY_WRITE_TOKEN=$SANITY_WRITE_TOKEN
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV GOOGLE_SECRET=$GOOGLE_SECRET
ENV MAILPIT_URL=$MAILPIT_URL
ENV RESEND_API_KEY=$RESEND_API_KEY
ENV AUTH_WEBHOOK_SECRET=$AUTH_WEBHOOK_SECRET
ENV GOOGLE_DATA_API_KEY=$GOOGLE_DATA_API_KEY
ENV HONEYCOMB_API_KEY=$HONEYCOMB_API_KEY
ENV HONEYCOMB_DATASET=$HONEYCOMB_DATASET
ENV BLUESKY_USERNAME=$BLUESKY_USERNAME
ENV BLUESKY_PASSWORD=$BLUESKY_PASSWORD
ENV VERCEL_DASHBOARD_URL=$VERCEL_DASHBOARD_URL

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies with pnpm
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    corepack enable pnpm && pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && pnpm run build;

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
