# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# Install system dependencies required for native compilation of better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Enable and configure pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy dependency manifests first for optimal Docker layer caching
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install all dependencies (including devDependencies required for compilation & testing)
ENV CI=true
RUN pnpm install --frozen-lockfile

# Copy source code, build configs, and test suites
COPY tsconfig*.json jest.config.js ./
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY tests/ ./tests/
COPY QUERIES.md ./

# Compile TypeScript to dist
RUN pnpm run build

# Run comprehensive query cookbook verification during build to validate queries
RUN pnpm run test:queries

# Default command executes all query cookbook tests
CMD ["pnpm", "run", "test:queries"]
