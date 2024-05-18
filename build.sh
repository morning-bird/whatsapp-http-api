#/usr/bin/bash

export TAG=latest
docker compose -f docker-compose-run.yaml build && docker compose -f docker-compose-run.yaml push