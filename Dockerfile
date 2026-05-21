# Base stage
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Build stage
FROM base AS build
WORKDIR /app

# Copy workspace config files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/client/package.json ./packages/client/
COPY packages/server/package.json ./packages/server/
COPY packages/core/package.json ./packages/core/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm run build

# Runtime stage
FROM base AS runtime
WORKDIR /app

# Install serve globally for serving static files
RUN pnpm add -g serve

# Copy built artifacts and dependencies from build stage
COPY --from=build /app .

# Environment variables
ENV NODE_ENV=production
ENV PORT=3002
ENV SERVER_BASE_URL=http://localhost:3002

# Download directories (can be overridden with -e or docker-compose)
ENV TEMP_DIR=/app/downloads
ENV DATA_DIR=/app/data
ENV UPLOAD_DIR=/app/uploads

# Create directories
RUN mkdir -p /app/downloads /app/data /app/uploads

# Make start script executable
RUN chmod +x start.sh

# Volumes for persistent storage
VOLUME ["/app/downloads", "/app/data", "/app/uploads"]

# Expose ports
EXPOSE 3001 3002

# Start services
CMD ["./start.sh"]
