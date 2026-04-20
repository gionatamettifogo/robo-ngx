#!/usr/bin/env bash

set -euo pipefail

IMAGE_REPO="gionata/robo-ngx"
PYPROJECT_FILE="pyproject.toml"

if ! command -v docker >/dev/null 2>&1; then
	echo "docker is required but was not found in PATH" >&2
	exit 1
fi

if [[ ! -f "${PYPROJECT_FILE}" ]]; then
	echo "Could not find ${PYPROJECT_FILE} in $(pwd)" >&2
	exit 1
fi

VERSION="$(
  sed -nE 's/^version = "([^"]+)"$/\1/p' "${PYPROJECT_FILE}" | head -n1
)"

if [[ -z "${VERSION}" ]]; then
  echo "Could not determine version from ${PYPROJECT_FILE}" >&2
  exit 1
fi

IMAGE_TAG="${IMAGE_REPO}:${VERSION}"

echo "Building ${IMAGE_TAG}"

if [[ -n "${DOCKER_PLATFORM:-}" ]]; then
  docker buildx build \
    --platform "${DOCKER_PLATFORM}" \
    --tag "${IMAGE_TAG}" \
    --load \
    .
else
  docker build \
    --tag "${IMAGE_TAG}" \
    .
fi

echo "Pushing ${IMAGE_TAG}"
docker push "${IMAGE_TAG}"

echo "Done: ${IMAGE_TAG}"
