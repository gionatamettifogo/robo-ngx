# ROBO Development Notes

This fork is set up for local development on branch `feature-robo`.

## Quick Start

From the repository root:

```bash
./robo-dev.sh
```

For normal development, this is enough. The script starts everything you need:

- Django development server on `8000`
- document consumer
- Celery worker
- Angular dev server on `4200`, or the next free port if `4200` is busy

Stop everything with `Ctrl+C`.

To force a frontend port:

```bash
ROBO_FRONTEND_PORT=4201 ./robo-dev.sh
```

## Backend

You usually do not need to run these commands manually if you use `./robo-dev.sh`.

From the repository root:

```bash
source .venv/bin/activate
cd src
../.venv/bin/python manage.py migrate
```

To run the Django development server:

```bash
cd src
../.venv/bin/python manage.py runserver
```

Useful additional backend processes:

```bash
cd src
../.venv/bin/python manage.py document_consumer
../.venv/bin/celery --app paperless worker -l DEBUG
```

Local runtime data is stored under `./data/robo-ngx/` and local settings are in `./paperless.conf`.
Redis is expected to be available at `redis://default:xxxx@robo1:6379/4`.

## Frontend

You usually do not need to run these commands manually if you use `./robo-dev.sh`.

Load the Node toolchain installed for this repo:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
```

From `src-ui/`, start the Angular development server:

```bash
cd src-ui
pnpm start
```

The frontend dev server normally runs on `http://localhost:4200/` and expects the backend API at `http://localhost:8000/api/`.

## Typical Workflow

Terminal 1:

```bash
cd /home/developer/github/robo-ngx
source .venv/bin/activate
cd src
../.venv/bin/python manage.py runserver
```

Terminal 2:

```bash
cd /home/developer/github/robo-ngx
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
cd src-ui
pnpm start
```

This matches the upstream paperless-ngx development pattern: backend on `localhost:8000`, frontend on `localhost:4200`.
