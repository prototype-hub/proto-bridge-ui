#!/usr/bin/env bash

rm -rf dist

pnpm run build

docker build -t "$FRONTEND_IMAGE" .
docker push "$FRONTEND_IMAGE"