jest.mock('@nestjs/core', () => ({ NestFactory: { createApplicationContext: jest.fn() } }));
jest.mock('../src/app.module', () => ({ AppModule: class {} }));
import { NestFactory } from '@nestjs/core';
import { main, parseDispatchArguments } from '../src/h6-notifications-cli';
describe('bounded foreground notification command', () => {
  it('defaults to twenty jobs and accepts a bounded explicit limit', () => {
    expect(parseDispatchArguments([])).toEqual({limit:20});
    expect(parseDispatchArguments(['--limit','1'])).toEqual({limit:1});
    expect(parseDispatchArguments(['--limit','20'])).toEqual({limit:20});
    expect(parseDispatchArguments(['--help'])).toEqual({help:true});
  });
  it.each([['--limit','0'],['--limit','21'],['--limit','1.5'],['--limit'],['--external'],['--help','--external']])('rejects malformed or unknown arguments before creating application context (%s)', (...args) => {
    expect(() => parseDispatchArguments(args)).toThrow('Usage:');
  });
});

describe('foreground dispatch outcome', () => {
  it.each([
    [{ claimed: 1, sent: 0, failed: 0, retried: 0 }, 1],
    [{ claimed: 1, sent: 1, failed: 0, retried: 0 }, undefined],
  ])('reports completion honestly and closes the context (%j)', async (outcome, exitCode) => {
    const argv = process.argv;
    const previousExit = process.exitCode;
    const run = jest.fn().mockResolvedValueOnce(outcome).mockResolvedValue({ claimed: 0, sent: 0, failed: 0, retried: 0 });
    const close = jest.fn().mockResolvedValue(undefined);
    (NestFactory.createApplicationContext as jest.Mock).mockResolvedValue({ get: () => ({ run }), close });
    const output = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      process.argv = ['node', 'dispatch', '--limit', '2'];
      process.exitCode = undefined;
      await main();
      expect(process.exitCode).toBe(exitCode);
      expect(output).toHaveBeenCalledWith(JSON.stringify({ ...outcome, stopped: false }));
      expect(close).toHaveBeenCalledTimes(1);
      if (exitCode) {
        expect(run).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('incomplete'));
      } else {
        expect(run).toHaveBeenCalledTimes(2);
        expect(error).not.toHaveBeenCalled();
      }
    } finally {
      process.argv = argv;
      process.exitCode = previousExit;
      output.mockRestore(); error.mockRestore();
    }
  });
});
