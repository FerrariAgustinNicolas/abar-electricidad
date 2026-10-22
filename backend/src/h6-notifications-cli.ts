const USAGE = 'Usage: npm run notifications:dispatch -- [--limit 1..20]\nRuns committed jobs once through local Mailpit only. SIGINT/SIGTERM stops before the next claim after the current bounded SMTP operation finishes. No external email is sent.';
type DispatchArguments = {help: true} | {limit: number};

export function parseDispatchArguments(args: string[]): DispatchArguments {
  if (args.length === 1 && args[0] === '--help') return {help:true};
  if (args.length === 0) return {limit:20};
  if (args.length === 2 && args[0] === '--limit' && /^(?:[1-9]|1[0-9]|20)$/.test(args[1])) return {limit:Number(args[1])};
  throw new Error(USAGE);
}

async function main(): Promise<void> {
  let args: DispatchArguments;
  try { args = parseDispatchArguments(process.argv.slice(2)); }
  catch { console.error(USAGE); process.exitCode = 2; return; }
  if ('help' in args) { console.log(USAGE); return; }
  const {NestFactory} = await import('@nestjs/core');
  const {AppModule} = await import('./app.module');
  const {NotificationDispatcher} = await import('./notifications/notification-dispatcher');
  const app = await NestFactory.createApplicationContext(AppModule, {logger:false, abortOnError:false});
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const total = {claimed:0, sent:0, failed:0, retried:0};
  try {
    const dispatcher = app.get(NotificationDispatcher);
    for (let count=0; count<args.limit && !stopping; count++) {
      const result = await dispatcher.run(1);
      for (const key of ['claimed','sent','failed','retried'] as const) total[key] += result[key];
      if (!result.claimed) break;
    }
    console.log(JSON.stringify({...total, stopped:stopping}));
  } finally {
    process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop);
    await app.close();
  }
}

if (require.main === module) void main().catch(() => {
  console.error('Local notification dispatch failed. Jobs retain their durable state for recovery; inspect sanitized job status.');
  process.exitCode = 1;
});
