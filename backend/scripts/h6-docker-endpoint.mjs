import { spawnSync } from 'node:child_process';

// Resolve metadata only; never contact a non-local daemon or remote context.
export function localDockerHost(env = process.env, run = spawnSync) {
  let host = env.DOCKER_HOST;
  if (env.DOCKER_CONTEXT || host === undefined) {
    const result = run('docker', ['context', 'inspect', ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : []), '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8', env });
    if (result.status !== 0) throw Error('Unable to resolve a local Docker endpoint');
    host = result.stdout.trim();
  }
  if (typeof host !== 'string' || !/^unix:\/\/\/[^\r\n]+$/.test(host)) {
    throw Error('H6 fixtures require a local Docker Unix socket');
  }
  return host;
}
