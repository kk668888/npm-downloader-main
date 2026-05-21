# Turborepo Migration Design

## Overview

Migrate npm-downloader from plain pnpm workspaces to Turborepo-managed monorepo, gaining build caching, dependency-aware task orchestration, and pipeline configuration.

## Motivation

Current `pnpm -r run build/dev/test` executes tasks in all packages without understanding dependency order, and has no caching — every build is a full rebuild. Turborepo solves both problems.

## Changes

### 1. New file: `turbo.json`

Pipeline configuration at the repo root:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

- `build`: `^build` ensures dependencies build first (types → core → server, types → client). Caches `dist/**`.
- `dev`: no cache, persistent (long-running dev servers).
- `test`: depends on build completing first.
- `clean`: no cache, no dependencies.

### 2. Root `package.json`

Scripts updated:

```json
{
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "dev": "turbo run dev",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "turbo": "^2",
    "tslib": "^2.8.1",
    "typescript": "^5.9.2"
  }
}
```

### 3. Sub-package `clean` scripts

Each package gets a `clean` script:

| Package | Script |
|---------|--------|
| `@npm-downloader/types` | `rm -rf dist` |
| `@npm-downloader/core` | `rm -rf dist` |
| `@npm-downloader/server` | `rm -rf dist` |
| `@npm-downloader/client` | `rm -rf dist` |

### 4. Deployment scripts updated

All scripts switch from `pnpm -C packages/xxx` to turbo commands:

**start.sh:**
```bash
# Before
node packages/server/dist/app.js &
serve packages/client/dist -p 3001 -s &

# After (unchanged - production runs built artifacts directly)
node packages/server/dist/app.js &
serve packages/client/dist -p 3001 -s &
```

Note: Production scripts (`start.sh`, `start.bat`) run built artifacts directly, so they stay the same. The `turbo` command is used during the **build step** only.

**start.bat / npm-downloader.ps1:**
- `pnpm run build` → `turbo run build` (build step)
- `pnpm -C packages/server dev` → `turbo run dev --filter=@npm-downloader/server` (dev step)
- `pnpm -C packages/client dev` → `turbo run dev --filter=@npm-downloader/client` (dev step)
- `pnpm -C packages/server start` → unchanged (runs `node dist/app.js`)
- `pnpm -C packages/client run serve:static` → unchanged (runs `serve dist`)

**start-dev.bat:**
- `pnpm -C packages/server dev` → `turbo run dev --filter=@npm-downloader/server`
- `pnpm -C packages/client dev` → `turbo run dev --filter=@npm-downloader/client`

**Dockerfile:**
- `RUN pnpm run build` → `RUN pnpm run build` (root script already calls turbo)
- No other changes needed

### 5. `.gitignore` update

Add:
```
.turbo/
```

### 6. `pack.sh` update

Add `.turbo` to exclusion list.

## Dependency graph (handled automatically by turbo)

```
@npm-downloader/types
    ├── @npm-downloader/core
    ├── @npm-downloader/server
    └── @npm-downloader/client

@npm-downloader/core
    └── @npm-downloader/server
```

Build order: types → core → server, types → client (parallel where possible).

## What stays the same

- `pnpm-workspace.yaml` — unchanged
- `pnpm` as package manager — unchanged
- Sub-package `package.json` internal scripts (build, dev, test) — unchanged
- Docker Compose configuration — unchanged
- All source code — unchanged

## Acceptance criteria

1. `turbo run build` builds packages in correct dependency order
2. Second `turbo run build` with no changes hits cache (instant)
3. `turbo run dev` starts server and client dev servers
4. `turbo run test` runs tests after build
5. All deployment scripts (bat, ps1, sh) work correctly
6. Docker build works with turbo
