#/usr/bin/bash

export TAG=lite-0.9
docker compose -f docker-compose-run.yaml build
docker compose -f docker-compose-run.yaml push
# docker compose -f docker-compose-run.yaml up