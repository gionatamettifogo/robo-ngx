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
BACKEND_PORT=8000
FRONTEND_PORT="${ROBO_FRONTEND_PORT:-4200}"
FRONTEND_PORT_WAS_SET=0
if [[ -n "${ROBO_FRONTEND_PORT:-}" ]]; then
	FRONTEND_PORT_WAS_SET=1
fi

port_in_use() {
	local port=$1
	(
		: >"/dev/tcp/127.0.0.1/$port"
	) >/dev/null 2>&1
}

if port_in_use "$FRONTEND_PORT"; then
	if ((FRONTEND_PORT_WAS_SET)); then
		echo "Frontend port $FRONTEND_PORT is already in use." >&2
		echo "Stop the existing process or choose another port with ROBO_FRONTEND_PORT=4201 ./robo-dev.sh." >&2
		exit 1
	fi

	for port in {4201..4220}; do
		if ! port_in_use "$port"; then
			FRONTEND_PORT="$port"
			break
		fi
	done

	if port_in_use "$FRONTEND_PORT"; then
		echo "Frontend ports 4200-4220 are already in use." >&2
		echo "Stop one of the existing processes or choose a free port with ROBO_FRONTEND_PORT=4300 ./robo-dev.sh." >&2
		exit 1
	fi
fi

if port_in_use "$BACKEND_PORT"; then
	echo "Backend port $BACKEND_PORT is already in use." >&2
	echo "A development stack may already be running. Use the existing http://localhost:$BACKEND_PORT/ server or stop the previous ./robo-dev.sh first." >&2
	exit 1
fi

export PAPERLESS_DEV_FRONTEND_URL="http://localhost:$FRONTEND_PORT"

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
if [[ "$FRONTEND_PORT" != "4200" ]]; then
	echo "Port 4200 is busy; using frontend port $FRONTEND_PORT."
fi
echo

start_process backend bash -lc "cd src && exec ../.venv/bin/python manage.py runserver"
start_process consumer bash -lc "cd src && exec ../.venv/bin/python manage.py document_consumer"
start_process worker bash -lc "cd src && exec \"$CELERY_BIN\" --app paperless worker -l INFO"
start_process frontend bash -lc "cd src-ui && exec pnpm start -- --port \"$FRONTEND_PORT\""

wait -n "${PIDS[@]}"
