# Publish the custom image to Docker Hub

The deployment script builds the existing Dockerfile and publishes its `release`
stage with Docker Buildx. Run it from any directory using Node.js 22 or later.
Docker must be running and Buildx must be installed.

## Build memory

Allocate at least **4 GiB** to Docker; **8 GiB** is recommended for this image.
On Docker Desktop, use **Settings > Resources > Memory**, then **Apply & Restart**.
Host RAM is separate from the Docker VM's allocation. On Apple Silicon, building
`linux/amd64` also uses emulation; use `--platform linux/arm64` when your deployment
server is ARM64.

The Dockerfile defaults to a 2048 MiB Node heap, two Yarn/native build workers,
and native packages for the target platform only. You can tune the heap/workers:

```bash
yarn docker:deploy --image YOUR_DOCKERHUB_USER/whatsapp-http-api \
  --tag custom --build-heap-mb 2048 --build-workers 1
```

`cannot allocate memory` / `ResourceExhausted` during `yarn install` means the
builder ran out of memory. Increase Docker's RAM and stop unused containers before
retrying. Raising the Node heap alone does not add RAM to Docker. The deployment
script checks the current Docker daemon's memory before login/build; when using a
remote Buildx builder, check that builder's resources separately as well.

## Preview the build

Choose your Docker Hub namespace and repository; the GitHub repository owner does
not automatically determine the Docker Hub namespace.

```bash
yarn docker:deploy --image YOUR_DOCKERHUB_USER/whatsapp-http-api --tag custom --dry-run
```

## Publish

Log in to Docker Hub, then execute the same command without `--dry-run`:

```bash
docker login
yarn docker:deploy --image YOUR_DOCKERHUB_USER/whatsapp-http-api --tag custom
```

Defaults are `WEBJS`, `chromium`, and `linux/amd64`. If `--tag` is omitted, the
image is tagged `sha-<12-character Git commit>`. The build uses the current local
working tree, so commit changes first if you want the revision label to identify
the exact source. Use `--latest` to also publish the `latest` tag.

For unattended deployment, supply `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` via
your environment/CI secrets. The token is passed to `docker login --password-stdin`,
not placed in the command line. `DOCKERHUB_IMAGE` can replace `--image`.

## Other build configurations

```bash
# A single tag with both AMD64 and ARM64 images (requires a multi-platform builder)
yarn docker:deploy --image YOUR_DOCKERHUB_USER/whatsapp-http-api \
  --tag custom --platform linux/amd64,linux/arm64

# Google Chrome is only available on AMD64 in this Dockerfile
yarn docker:deploy --image YOUR_DOCKERHUB_USER/whatsapp-http-api \
  --tag custom-chrome --browser chrome

# Browser-free GOWS image
yarn docker:deploy --image YOUR_DOCKERHUB_USER/whatsapp-http-api \
  --tag custom-gows --engine GOWS --browser none
```

Buildx publishes directly to Docker Hub; it does not load the image into the local
Docker image store. The script exits with an error if Docker, login, or the build
fails. It does not deploy/restart a server or push Git branches.
