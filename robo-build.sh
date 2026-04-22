#!/usr/bin/env bash

set -euo pipefail

IMAGE_REPO="gionata/robo-ngx"
PYPROJECT_FILE="pyproject.toml"
DOCKER_PLATFORMS="linux/amd64,linux/arm64"
BUILDX_BUILDER="robo-ngx-multiarch"

if ! command -v docker >/dev/null 2>&1; then
	echo "docker is required but was not found in PATH" >&2
	exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
	echo "docker buildx is required for multi-architecture builds" >&2
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

if ! docker buildx inspect "${BUILDX_BUILDER}" >/dev/null 2>&1; then
  docker buildx create \
    --name "${BUILDX_BUILDER}" \
    --driver docker-container \
    --use
fi

docker buildx inspect "${BUILDX_BUILDER}" --bootstrap >/dev/null

echo "Building and pushing ${IMAGE_TAG} for ${DOCKER_PLATFORMS}"
docker buildx build \
  --builder "${BUILDX_BUILDER}" \
  --platform "${DOCKER_PLATFORMS}" \
  --tag "${IMAGE_TAG}" \
  --push \
  .

echo "Done: ${IMAGE_TAG}"
