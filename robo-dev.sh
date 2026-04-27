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
BACKEND_PORT=4201
FRONTEND_PORT=4200

port_in_use() {
	local port=$1
	(
		: >"/dev/tcp/localhost/$port"
	) >/dev/null 2>&1
}

if port_in_use "$FRONTEND_PORT"; then
	echo "Frontend port $FRONTEND_PORT is already in use." >&2
	echo "Stop the existing process that is using http://localhost:$FRONTEND_PORT/ and try again." >&2
	exit 1
fi

if port_in_use "$BACKEND_PORT"; then
	echo "Backend port $BACKEND_PORT is already in use." >&2
	echo "A development stack may already be running. Use the existing http://localhost:$BACKEND_PORT/ server or stop the previous ./robo-dev.sh first." >&2
	exit 1
fi

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
echo "Backend:  http://localhost:$BACKEND_PORT/"
echo "Frontend: http://localhost:$FRONTEND_PORT/"
echo

start_process backend bash -lc "cd src && exec ../.venv/bin/python manage.py runserver \"$BACKEND_PORT\""
start_process consumer bash -lc "cd src && exec ../.venv/bin/python manage.py document_consumer"
start_process worker bash -lc "cd src && exec \"$CELERY_BIN\" --app paperless worker -l INFO"
start_process frontend bash -lc "cd src-ui && exec pnpm exec ng serve --port \"$FRONTEND_PORT\""

wait -n "${PIDS[@]}"
