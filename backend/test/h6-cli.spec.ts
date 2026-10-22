import { parseDispatchArguments } from '../src/h6-notifications-cli';
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
