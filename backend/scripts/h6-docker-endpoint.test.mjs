import test from 'node:test';
import assert from 'node:assert/strict';
import { localDockerHost } from './h6-docker-endpoint.mjs';

test('explicit local Docker host does not inspect any context', () => {
  assert.equal(localDockerHost({ DOCKER_HOST: 'unix:///var/run/docker.sock' }, () => assert.fail('unexpected context lookup')), 'unix:///var/run/docker.sock');
});
test('default and named contexts resolve their configured local endpoint', () => {
  for (const env of [{}, { DOCKER_CONTEXT: 'desktop-linux', DOCKER_HOST: 'unix:///ignored.sock' }]) {
    const calls = [];
    assert.equal(localDockerHost(env, (command, args) => {
      calls.push([command, args]);
      return { status: 0, stdout: 'unix:///home/demo/.docker/run/docker.sock\n' };
    }), 'unix:///home/demo/.docker/run/docker.sock');
    assert.deepEqual(calls, [['docker', ['context', 'inspect', ...(env.DOCKER_CONTEXT ? ['desktop-linux'] : []), '--format', '{{.Endpoints.docker.Host}}']]]);
  }
});
test('non-local explicit endpoints are rejected without probing them', () => {
  for (const host of ['tcp://127.0.0.1:2375', 'ssh://remote', 'unix://remote/socket', '']) {
    assert.throws(() => localDockerHost({ DOCKER_HOST: host }, () => assert.fail('unexpected probe')), /local Docker/);
  }
});
test('unavailable or non-local contexts fail before fixture creation', () => {
  for (const result of [{ status: 1, stdout: '' }, { status: 0, stdout: 'ssh://remote\n' }]) {
    assert.throws(() => localDockerHost({}, () => result), /local Docker/);
  }
});
