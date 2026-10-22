import { NotificationDeliveryError, NotificationDispatcher, NotificationMessage, notificationMessage } from '../src/notifications/notification-dispatcher';
import { createServer } from 'node:net';
import { LocalMailpitSmtpTransport } from '../src/notifications/notification-dispatcher';

const id = '11111111-1111-4111-8111-111111111111';
const leaseToken = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-10-22T12:00:00.000Z');

function fixture(send: () => Promise<void>) {
  let claimed = false;
  const sql: string[] = [];
  const data: any[] = [];
  const job = { id, orderId: '22222222-2222-4222-8222-222222222222', kind: 'ORDER_CREATED_BUYER',
    recipient: 'buyer@example.test', payload: { orderNumber: 'AB-123', address: 'must not be mailed' },
    attemptCount: 1, totalAttemptCount: 8, version: 2, leaseToken };
  const tx = { $executeRaw: jest.fn(async (strings: TemplateStringsArray) => { sql.push(strings.join('?')); return 0; }), $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
    sql.push(strings.join('?'));
    if (claimed) return [];
    claimed = true; return [job];
  }) };
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    notificationJob: { updateMany: jest.fn(async (args) => { data.push(args); return { count: 1 }; }) },
  };
  const sent: Array<[string, NotificationMessage]> = [];
  const transport = { send: jest.fn(async (recipient: string, message: NotificationMessage) => { sent.push([recipient, message]); await send(); }) };
  const config = { get: (key: string) => ({ H6_SMTP_HOST: '127.0.0.1', H6_SMTP_PORT: 1025 } as any)[key] };
  const dispatcher = new NotificationDispatcher(prisma as never, config as never, transport, () => now);
  return { dispatcher, prisma, tx, transport, sql, data, sent };
}

describe('H6 durable notification dispatcher', () => {
  it('claims one job at a time with SKIP LOCKED, fences completion, and omits private payload data', async () => {
    const f = fixture(async () => undefined);
    await expect(f.dispatcher.run(1)).resolves.toEqual({ claimed: 1, sent: 1, failed: 0, retried: 0 });
    expect(f.sql).toHaveLength(2);
    expect(f.sql[0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(f.sql[0]).toContain('LIMIT 1');
    expect(f.sql[1]).toContain('FOR UPDATE SKIP LOCKED');
    expect(f.sql[1]).toContain('LIMIT 1');
    expect(f.prisma.notificationJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id, state: 'PROCESSING', leaseToken, version: 2 },
      data: expect.objectContaining({ state: 'SENT', sentAt: now, version: { increment: 1 }, leaseToken: null, leaseUntil: null }),
    }));
    const sentMessage = f.sent[0][1];
    expect(sentMessage.text).toContain('DEMO');
    expect(sentMessage.text).toContain('AB-123');
    expect(sentMessage.text).not.toContain('must not be mailed');
    expect(sentMessage.text).not.toContain('address');
  });

  it('uses finite backoff for a transient transport failure and a permanent terminal state', async () => {
    const transient = fixture(async () => { throw new NotificationDeliveryError('SMTP_UNAVAILABLE', false); });
    await expect(transient.dispatcher.run(1)).resolves.toEqual({ claimed: 1, sent: 0, failed: 0, retried: 1 });
    expect(transient.data[0].data).toMatchObject({ state: 'RETRY_WAIT', lastError: 'SMTP_UNAVAILABLE',
      nextAttemptAt: new Date(now.getTime() + 30_000), leaseToken: null });

    const permanent = fixture(async () => { throw new NotificationDeliveryError('SMTP_REJECTED', true); });
    await expect(permanent.dispatcher.run(1)).resolves.toEqual({ claimed: 1, sent: 0, failed: 1, retried: 0 });
    expect(permanent.data[0].data).toMatchObject({ state: 'FAILED', lastError: 'SMTP_REJECTED', nextAttemptAt: null });
  });

  it('fails closed for an external SMTP host and enforces the run bound', async () => {
    const f = fixture(async () => undefined);
    await expect(f.dispatcher.run(21)).rejects.toThrow('maxJobs');
    const external = new NotificationDispatcher(f.prisma as never,
      { get: () => 'mail.example.com' } as never, f.transport, () => now);
    await expect(external.run()).resolves.toEqual({ claimed: 0, sent: 0, failed: 0, retried: 0 });
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.transport.send).not.toHaveBeenCalled();
  });

  it('accepts only a validated order number and renders fixed plain-text DEMO messages', () => {
    const message = notificationMessage('ORDER_CANCELLED_ADMIN', { orderNumber: 'AB-123', notes: 'private' });
    expect(message?.subject).toContain('DEMO');
    expect(message?.text).not.toContain('private');
    expect(notificationMessage('ORDER_CANCELLED_ADMIN', { orderNumber: 'AB-123\r\nBcc: attacker@elsewhere.test' })).toBeNull();
    expect(notificationMessage('ORDER_CREATED_BUYER', { orderNumber: 'ABAR-H5-123e4567-e89b-12d3-a456-426614174000' })).not.toBeNull();
  });

  it('requires a Mailpit greeting and fails promptly on malformed greeting or early close', async () => {
    async function withServer(onConnection: (socket: import('node:net').Socket) => void, verify: (port: number) => Promise<void>) {
      const server = createServer(onConnection);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test SMTP server did not bind');
      try { await verify(address.port); } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    }
    async function send(port: number): Promise<void> {
      const transport = new LocalMailpitSmtpTransport({ get: (key: string) => ({ H6_SMTP_HOST: '127.0.0.1', H6_SMTP_PORT: port } as any)[key] } as never);
      await transport.send('buyer@example.test', { subject: 'DEMO test', text: 'DEMO test' });
    }

    let commands = '';
    await withServer((socket) => {
      socket.write('220 unrelated.example ESMTP ready\r\n');
      socket.on('data', (data) => { commands += data.toString(); });
    }, async (port) => {
      await expect(send(port)).rejects.toMatchObject({ safeCode: 'SMTP_REJECTED', permanent: true });
      expect(commands).toBe('');
    });

    await withServer((socket) => socket.write('not an SMTP response\r\n'), async (port) => {
      await expect(send(port)).rejects.toMatchObject({ safeCode: 'SMTP_UNAVAILABLE', permanent: false });
    });

    await withServer((socket) => socket.destroy(), async (port) => {
      await expect(Promise.race([
        send(port),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP close hung')), 500)),
      ])).rejects.toMatchObject({ safeCode: 'SMTP_UNAVAILABLE', permanent: false });
    });
  });
});
