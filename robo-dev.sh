#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
CELERY_BIN="$ROOT_DIR/.venv/bin/celery"

if [[ ! -x "$PYTHON_BIN" ]]; then
	echo "Missing $PYTHON_BIN. Create the virtualenv first." >&2
	exit 1
fi

if [[ ! -d "$ROOT_DIR/src-ui/node_modules" ]]; then
	echo "Missing $ROOT_DIR/src-ui/node_modules. Install frontend dependencies first." >&2
	exit 1
fi

if [[ -z "${NVM_DIR:-}" ]]; then
	export NVM_DIR="$HOME/.nvm"
fi

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
	echo "nvm was not found at $NVM_DIR/nvm.sh." >&2
	exit 1
fi

# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null

declare -a PIDS=()

cleanup() {
	local status=$?
	trap - EXIT INT TERM

	if ((${#PIDS[@]})); then
		echo
		echo "Stopping development processes..."
		kill "${PIDS[@]}" 2>/dev/null || true
		wait "${PIDS[@]}" 2>/dev/null || true
	fi

	exit "$status"
}

trap cleanup EXIT INT TERM

start_process() {
	local name=$1
	shift

	(
		cd "$ROOT_DIR"
		exec "$@"
		) > >(
		stdbuf -oL awk -v prefix="[$name] " "{ print prefix \$0; fflush(); }"
		) 2> >(
		stdbuf -oL awk -v prefix="[$name] " "{ print prefix \$0; fflush(); }" >&2
	) &

	PIDS+=("$!")
}

echo "Starting Paperless-ngx development stack..."
echo "Backend:  http://localhost:8000/"
echo "Frontend: http://localhost:4200/"
echo

start_process backend bash -lc "cd src && exec ../.venv/bin/python manage.py runserver"
start_process consumer bash -lc "cd src && exec ../.venv/bin/python manage.py document_consumer"
start_process worker bash -lc "cd src && exec \"$CELERY_BIN\" --app paperless worker -l INFO"
start_process frontend bash -lc "cd src-ui && exec pnpm start"

wait -n "${PIDS[@]}"
