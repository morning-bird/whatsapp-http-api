#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs } = require('node:util');

const root = path.resolve(__dirname, '..');

function usage() {
  console.log(`Build and publish WAHA to Docker Hub.

Usage:
  node scripts/deploy-dockerhub.js --image <namespace/repository> [options]

Options:
  --image <name>       Docker Hub image (or DOCKERHUB_IMAGE)
  --tag <tag>          Image tag (default: sha-<current Git commit>)
  --platform <list>    linux/amd64 or linux/arm64, comma-separated
                      (default: linux/amd64)
  --browser <name>     chromium, chrome, or none (default: chromium)
  --engine <name>      WEBJS, WPP, NOWEB, or GOWS (default: WEBJS)
  --build-heap-mb <n>  Node heap limit during build in MiB (default: 2048)
  --build-workers <n>  Yarn/native build worker count (default: 2)
  --latest            Also publish the latest tag
  --dry-run           Print the build command without building or publishing
  --help              Show this help

Authentication:
  Run docker login before deployment, or set both DOCKERHUB_USERNAME and
  DOCKERHUB_TOKEN. Tokens are passed to docker login via stdin.
`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} failed (exit ${result.status ?? result.signal})`);
  }
  return result;
}

function main() {
  const { values } = parseArgs({
    options: {
      image: { type: 'string' },
      tag: { type: 'string' },
      platform: { type: 'string', default: 'linux/amd64' },
      browser: { type: 'string', default: 'chromium' },
      engine: { type: 'string', default: 'WEBJS' },
      'build-heap-mb': { type: 'string', default: '2048' },
      'build-workers': { type: 'string', default: '2' },
      latest: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    usage();
    return;
  }

  const image = values.image || process.env.DOCKERHUB_IMAGE;
  if (!image || !/^[a-z0-9][a-z0-9_-]*\/[a-z0-9]+(?:[._-]+[a-z0-9]+)*$/.test(image)) {
    throw new Error('--image must be a lowercase Docker Hub namespace/repository');
  }
  const tagPattern = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
  if (values.tag && !tagPattern.test(values.tag)) {
    throw new Error('Invalid Docker image tag');
  }
  const platforms = values.platform.split(',');
  if (platforms.some((platform) => !['linux/amd64', 'linux/arm64'].includes(platform))) {
    throw new Error('--platform supports linux/amd64 and linux/arm64 only');
  }
  if (!['chromium', 'chrome', 'none'].includes(values.browser)) {
    throw new Error('--browser must be chromium, chrome, or none');
  }
  if (!['WEBJS', 'WPP', 'NOWEB', 'GOWS'].includes(values.engine)) {
    throw new Error('--engine must be WEBJS, WPP, NOWEB, or GOWS');
  }
  if (values.browser === 'chrome' && platforms.includes('linux/arm64')) {
    throw new Error('The Dockerfile supports Chrome on linux/amd64 only');
  }
  if (values.browser === 'none' && ['WEBJS', 'WPP'].includes(values.engine)) {
    throw new Error(`${values.engine} requires chromium or chrome`);
  }
  for (const option of ['build-heap-mb', 'build-workers']) {
    if (!/^[1-9][0-9]*$/.test(values[option]) || !Number.isSafeInteger(Number(values[option]))) {
      throw new Error(`--${option} must be a positive integer`);
    }
  }

  const revision = run('git', ['rev-parse', 'HEAD'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  }).stdout.trim();
  const tag = values.tag || `sha-${revision.slice(0, 12)}`;
  const tags = [...new Set([tag, ...(values.latest ? ['latest'] : [])])];
  const args = [
    'buildx', 'build',
    '--file', path.join(root, 'Dockerfile'),
    '--target', 'release',
    '--platform', values.platform,
    '--build-arg', `USE_BROWSER=${values.browser}`,
    '--build-arg', `WHATSAPP_DEFAULT_ENGINE=${values.engine}`,
    '--build-arg', `BUILD_NODE_HEAP_MB=${values['build-heap-mb']}`,
    '--build-arg', `BUILD_WORKERS=${values['build-workers']}`,
    '--label', `org.opencontainers.image.revision=${revision}`,
    '--progress', 'plain',
  ];
  for (const imageTag of tags) args.push('--tag', `${image}:${imageTag}`);
  args.push('--push', root);

  console.log(`Images: ${tags.map((imageTag) => `${image}:${imageTag}`).join(', ')}`);
  console.log(`Engine: ${values.engine}; browser: ${values.browser}; platforms: ${values.platform}`);
  console.log(['docker', ...args].map((arg) => JSON.stringify(arg)).join(' '));
  if (values['dry-run']) return;

  const memoryBytes = Number(run('docker', ['info', '--format', '{{.MemTotal}}'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  }).stdout.trim());
  const memoryGiB = memoryBytes / (1024 ** 3);
  if (!Number.isFinite(memoryGiB) || memoryGiB < 4) {
    throw new Error(
      `Docker has ${Number.isFinite(memoryGiB) ? memoryGiB.toFixed(2) : 'unknown'} GiB RAM. ` +
      'This build needs at least 4 GiB; 8 GiB is recommended. ' +
      'In Docker Desktop open Settings > Resources > Memory, increase it, then Apply & Restart.',
    );
  }
  if (Number(values['build-heap-mb']) >= memoryBytes / (1024 ** 2)) {
    throw new Error('--build-heap-mb must leave RAM available for native builds and other Docker stages');
  }
  run('docker', ['buildx', 'version']);

  const username = process.env.DOCKERHUB_USERNAME;
  const token = process.env.DOCKERHUB_TOKEN;
  if (username || token) {
    if (!username || !token) {
      throw new Error('Set both DOCKERHUB_USERNAME and DOCKERHUB_TOKEN, or use docker login');
    }
    run('docker', ['login', '--username', username, '--password-stdin'], {
      input: `${token}\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }
  run('docker', args);
  console.log(`Published ${tags.map((imageTag) => `${image}:${imageTag}`).join(', ')}`);
}

try {
  main();
} catch (error) {
  console.error(`Deployment failed: ${error.message}`);
  process.exitCode = 1;
}
