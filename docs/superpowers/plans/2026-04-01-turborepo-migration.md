# Turborepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate npm-downloader from plain pnpm workspaces to Turborepo-managed monorepo with build caching and dependency-aware task orchestration.

**Architecture:** Add Turborepo as the task orchestrator on top of the existing pnpm workspace structure. Turborepo reads `turbo.json` at the repo root to understand task pipelines and dependency order (`^build` = build dependencies first). The package manager remains pnpm — turbo only orchestrates `run` scripts.

**Tech Stack:** Turborepo ^2, pnpm 10, TypeScript

---

### Task 1: Create `turbo.json`

**Files:**
- Create: `turbo.json`

- [ ] **Step 1: Create turbo.json at repo root**

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

- [ ] **Step 2: Commit**

```bash
git add turbo.json
git commit -m "feat: add turbo.json pipeline configuration"
```

---

### Task 2: Update root `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update scripts and add turbo dependency**

Change `package.json` to:

```json
{
  "name": "npm-downloader-monorepo",
  "private": true,
  "packageManager": "pnpm@10.13.1",
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "clean": "turbo run clean",
    "dev": "turbo run dev"
  },
  "devDependencies": {
    "tslib": "^2.8.1",
    "turbo": "^2",
    "typescript": "^5.9.2"
  }
}
```

Key changes from current file:
- `build`: `"pnpm -r run build"` → `"turbo run build"`
- `test`: `"pnpm -r run test"` → `"turbo run test"`
- `clean`: `"pnpm -r exec -- rm -rf node_modules && rm -rf node_modules"` → `"turbo run clean"`
- `dev`: `"pnpm -r run dev"` → `"turbo run dev"`
- Added `"turbo": "^2"` to devDependencies

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat: switch root scripts to turbo run"
```

---

### Task 3: Add `clean` scripts to each sub-package

**Files:**
- Modify: `packages/types/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/server/package.json`
- Modify: `packages/client/package.json`

Each package needs a `"clean": "rm -rf dist"` script so `turbo run clean` can execute it.

- [ ] **Step 1: Add clean script to `packages/types/package.json`**

Add `"clean": "rm -rf dist"` to the `scripts` section:

```json
"scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
}
```

- [ ] **Step 2: Add clean script to `packages/core/package.json`**

Add `"clean": "rm -rf dist"` to the `scripts` section:

```json
"scripts": {
    "build": "tsc",
    "test": "jest",
    "clean": "rm -rf dist"
}
```

- [ ] **Step 3: Add clean script to `packages/server/package.json`**

Add `"clean": "rm -rf dist"` to the `scripts` section:

```json
"scripts": {
    "dev": "tsx watch src/app.ts",
    "build": "tsc",
    "start": "node dist/app.js",
    "test": "vitest run",
    "clean": "rm -rf dist"
}
```

- [ ] **Step 4: Add clean script to `packages/client/package.json`**

Add `"clean": "rm -rf dist"` to the `scripts` section:

```json
"scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview",
    "serve:static": "serve dist -p 3001 -s",
    "test": "playwright test tests/smoke.spec.ts",
    "test:ui": "playwright test --ui",
    "test:smoke": "playwright test tests/smoke.spec.ts",
    "test:report": "playwright show-report",
    "test:contrast": "npx tsx tests/contrast-check.ts",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "clean": "rm -rf dist"
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/types/package.json packages/core/package.json packages/server/package.json packages/client/package.json
git commit -m "feat: add clean script to all sub-packages"
```

---

### Task 4: Install turbo and verify build

**Files:** None (runtime verification)

- [ ] **Step 1: Install dependencies**

```bash
pnpm install
```

Expected: turbo ^2 is installed, lockfile updated.

- [ ] **Step 2: Run `turbo run build` and verify dependency order**

```bash
pnpm run build
```

Expected output shows turbo executing builds in order: `@npm-downloader/types` first, then `@npm-downloader/core` and `@npm-downloader/client` in parallel, then `@npm-downloader/server`. Each task shows `FULL` or `CACHE HIT` status.

- [ ] **Step 3: Run `turbo run build` again and verify cache**

```bash
pnpm run build
```

Expected: all tasks show `CACHE HIT`, near-instant completion.

- [ ] **Step 4: Commit lockfile changes**

```bash
git add pnpm-lock.yaml
git commit -m "feat: install turbo and update lockfile"
```

---

### Task 5: Update `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Verify `.turbo/` entry exists**

The `.gitignore` at line 15 already contains `/.turbo/`. No change needed — this is a verification step.

Confirm line 15 reads: `/.turbo/`

---

### Task 6: Update `pack.sh`

**Files:**
- Modify: `pack.sh`

- [ ] **Step 1: Add `.turbo` to exclusion list**

In `pack.sh`, add `"turbo"` after the `"dockerData"` line in the `EXCLUDES` array (around line 61):

```bash
    # Git and tools
    ".git"
    ".claude"
    "dockerData"
    ".turbo"
```

- [ ] **Step 2: Commit**

```bash
git add pack.sh
git commit -m "feat: exclude .turbo from pack script"
```

---

### Task 7: Update `npm-downloader.ps1`

**Files:**
- Modify: `npm-downloader.ps1`

The PowerShell script uses `pnpm run build` (which already calls `turbo run build` via the root script) and `pnpm dev` / `pnpm start` per-package for service startup. Per the spec, only dev mode commands need updating.

- [ ] **Step 1: Update `Build-Project` function**

No change needed — `pnpm run build` at line 183 calls the root script which now runs `turbo run build`.

- [ ] **Step 2: Update dev-mode server startup (line 230)**

Change:
```powershell
        $serverCmd = "cd /d `"$serverPath`" & pnpm dev >> `"$serverLog`" 2>&1"
```
To:
```powershell
        $serverCmd = "cd /d `"$SCRIPT_DIR`" & pnpm exec turbo run dev --filter=@npm-downloader/server >> `"$serverLog`" 2>&1"
```

- [ ] **Step 3: Update dev-mode client startup (line 255)**

Change:
```powershell
        $clientCmd = "cd /d `"$clientPath`" & pnpm dev >> `"$clientLog`" 2>&1"
```
To:
```powershell
        $clientCmd = "cd /d `"$SCRIPT_DIR`" & pnpm exec turbo run dev --filter=@npm-downloader/client >> `"$clientLog`" 2>&1"
```

- [ ] **Step 4: Commit**

```bash
git add npm-downloader.ps1
git commit -m "feat: update ps1 dev mode to use turbo filter"
```

---

### Task 8: Verify `start.bat` (no changes needed)

**Files:** None

- [ ] **Step 1: Verify start.bat requires no changes**

`start.bat` uses `pnpm run build` (root script, now calls turbo) for building, and `pnpm start` / `pnpm run serve:static` for production startup (runs built artifacts directly). Both work correctly with the migration. No file modifications needed.

---

### Task 9: Update `start-dev.bat`

**Files:**
- Modify: `start-dev.bat`

- [ ] **Step 1: Update server dev startup (line 51)**

Change:
```batch
start "npm-downloader Server (Dev)" cmd /k "cd /d "%PROJECT_ROOT%packages\server" && pnpm dev"
```
To:
```batch
start "npm-downloader Server (Dev)" cmd /k "cd /d "%PROJECT_ROOT%" && pnpm exec turbo run dev --filter=@npm-downloader/server"
```

- [ ] **Step 2: Update client dev startup (line 54)**

Change:
```batch
start "npm-downloader Client (Dev)" cmd /k "cd /d "%PROJECT_ROOT%packages\client" && pnpm dev"
```
To:
```batch
start "npm-downloader Client (Dev)" cmd /k "cd /d "%PROJECT_ROOT%" && pnpm exec turbo run dev --filter=@npm-downloader/client"
```

- [ ] **Step 3: Commit**

```bash
git add start-dev.bat
git commit -m "feat: update start-dev.bat to use turbo filter"
```

---

### Task 10: Verify `Dockerfile` (no changes needed)

**Files:** None

- [ ] **Step 1: Verify Dockerfile requires no changes**

The Dockerfile works correctly with turbo because:
1. `pnpm install --frozen-lockfile` installs turbo (it's in root devDependencies)
2. `RUN pnpm run build` calls the root script which now runs `turbo run build`
3. Production CMD (`./start.sh`) runs built artifacts directly — no turbo needed at runtime

No file modifications needed.

---

### Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update package manager description**

Find the line in the tech stack table:
```markdown
| 包管理器 | pnpm workspaces |
```
Change to:
```markdown
| 任务编排 | Turborepo |
| 包管理器 | pnpm workspaces |
```

- [ ] **Step 2: Update the build commands section**

Find:
```bash
# 构建所有包
pnpm run build
```

No change needed — the command is the same, but turbo handles it now.

- [ ] **Step 3: Add turbo commands to the commands section**

After the "工具命令" section with `pnpm run clean`, add:

```bash
# Turborepo 命令
turbo run build          # 构建所有包（带缓存）
turbo run build --force  # 强制全量构建（忽略缓存）
turbo run dev --filter=@npm-downloader/server  # 仅启动 server 开发
turbo run clean          # 清理所有 dist 目录
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Turborepo info"
```

---

### Task 12: End-to-end verification

**Files:** None

- [ ] **Step 1: Clean build from scratch**

```bash
pnpm run clean
pnpm run build
```

Expected: turbo builds in correct order (types → core/server/client), all succeed.

- [ ] **Step 2: Verify cache hit**

```bash
pnpm run build
```

Expected: all tasks show `CACHE HIT`.

- [ ] **Step 3: Verify test pipeline**

```bash
pnpm run test
```

Expected: tests run after build completes (turbo ensures build runs first).

- [ ] **Step 4: Verify clean**

```bash
pnpm run clean
```

Expected: all `dist/` directories removed.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address turborepo migration issues found during verification"
```
