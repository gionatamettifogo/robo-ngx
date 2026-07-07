# Robo-ngx — Agents.md

## What this is

A fork of [paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) that adds AI chat capabilities. An in-app chat feature was originally built into this fork (chats list, chat detail, streaming, agents), but it has since been extracted into a standalone external app at `https://chat.seratonin.it`. The Paperless-ngx fork now only contains a **Chats** sidebar link that redirects the user to the external chat app, authenticating them by POSTing their Paperless URL and API token.

### Key changes vs upstream

- **Sidebar "Chats" link** (`src-ui/src/app/components/app-frame/app-frame.component.html`) — routes to `chat.seratonin.it` via a hidden form POST.
- **`openChat()` method** (`app-frame.component.ts`) — fetches the user's auth token (generating one if missing), posts `paperlessUrl` + `paperlessToken` to `https://chat.seratonin.it/api/signin`.
- **Permission guard** — the AI sidebar group is gated by `PermissionType.Chat`.
- **Version string** (`src/paperless/version.py`) — `__full_version_str__` is manually set to match `pyproject.toml` (e.g. `"2.20.13.189"`). Upstream only tracks `X.Y.Z` via a tuple; the `.N` patch number is robo-ngx-specific.
- **Frontend version display** — simplified to `Robo-ngx v<version>` without appending `#branch-tag`.

## Branch

Active development branch: **`feature-robo`** (pushed to `origin/feature-robo`).

## Local development (seratonin)

Prerequisites: Node.js 20+, pnpm, Python 3.12+, uv, PostgreSQL/Redis (or rely on SQLite default).

```bash
cd /home/developer/github/robo-ngx

# 1. Python venv (one-time)
uv sync --group dev

# 2. Frontend deps (one-time)
cd src-ui && CI=true pnpm install && cd ..

# 3. Migrations (SQLite default, or set PAPERLESS_DBHOST for PostgreSQL)
cd src && PAPERLESS_REDIS=redis://localhost:6379 ../.venv/bin/python manage.py migrate && cd ..

# 4. Run the dev stack (backend:4201, frontend:4200)
./robo-dev.sh
```

The dev server runs:
- Backend (Django runserver) on port **4201**
- Frontend (Angular serve) on port **4200**
- Document consumer and Celery worker

Port 8000 is occupied by LiteLLM on seratonin — do not use it.

Environment variables (optional):
- `ROBO_BACKEND_PORT` — override backend port (default 4201)
- `ROBO_FRONTEND_PORT` — override frontend port (default 4200)
- `PAPERLESS_REDIS` — Redis URL (defaults to `redis://localhost:6379`)
- `PAPERLESS_DBHOST` — set to use PostgreSQL instead of SQLite

## Building a Docker image

```bash
cd /home/developer/github/robo-ngx

# Ensure version is consistent across all three places:
#   pyproject.toml          → version = "2.20.13.NNN"
#   src/paperless/version.py → __full_version_str__ = "2.20.13.NNN"
#   src-ui/src/environments/environment.prod.ts → version: '2.20.13.NNN'
#
# Convention: NNN = day of the year (e.g. Jan 1 = .001, Jul 7 ≈ .188).
# See pyproject.toml comment for reference.

docker build -t gionata/robo-ngx:2.20.13.NNN .
docker push gionata/robo-ngx:2.20.13.NNN
```

Do NOT pass `--build-arg PNGX_TAG_VERSION=...` unless you want the frontend tag overridden (it caused `#feature-robo` to appear in the version string before the display logic was fixed).

## Deploying to idb1 (Indena servers)

The Indena stack lives on idb1 at `/mnt/volume-fsn1-1/github/indena/`.

```bash
# 1. Update the image tag in docker-compose.yaml (both paperless services)
ssh developer@idb1 "sed -i 's/gionata\/robo-ngx:OLD/gionata\/robo-ngx:NEW/g' /mnt/volume-fsn1-1/github/indena/docker-compose.yaml"

# 2. Pull and redeploy
ssh developer@idb1 "cd /mnt/volume-fsn1-1/github/indena && docker compose pull indena-batch-paperless indena-legal-paperless && docker compose up -d --remove-orphans indena-batch-paperless indena-legal-paperless"

# 3. Verify health
ssh developer@idb1 "docker ps --filter name=indena-batch-paperless --filter name=indena-legal-paperless --format '{{.Names}}\t{{.Image}}\t{{.Status}}'"
```

Services deployed:
- `indena-batch-paperless` → docs1.seratonin.it (batch records)
- `indena-legal-paperless` → docs2.seratonin.it (legal documents)

Both use `gionata/robo-ngx` images on the `proxy` Docker network behind a Cloudflare tunnel.

## Testing

```bash
cd /home/developer/github/robo-ngx
source .venv/bin/activate
cd src
pytest paperless/tests/ documents/tests/  # subset as needed
```

Frontend tests live under `src-ui/` and run via:
```bash
cd src-ui && CI=true pnpm exec ng test --watch=false
```
