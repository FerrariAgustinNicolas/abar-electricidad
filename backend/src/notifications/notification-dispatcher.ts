import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Socket, connect } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';

export const NOTIFICATION_SMTP_TRANSPORT = Symbol('NOTIFICATION_SMTP_TRANSPORT');
export const NOTIFICATION_CLOCK = Symbol('NOTIFICATION_CLOCK');
const RUN_LIMIT = 20;
const SMTP_DEADLINE_MS = 5000;
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000] as const;
const RECIPIENT = /^[A-Za-z0-9._+-]{1,64}@example\.test$/;
const ORDER_NUMBER = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

export type NotificationKind = 'ORDER_CREATED_BUYER' | 'ORDER_CREATED_ADMIN' | 'PAYMENT_CONFIRMED_BUYER' |
  'PAYMENT_CONFIRMED_ADMIN' | 'ORDER_READY_BUYER' | 'ORDER_CANCELLED_BUYER' | 'ORDER_CANCELLED_ADMIN';
export type SafeNotificationError = 'SMTP_UNAVAILABLE' | 'SMTP_REJECTED' | 'INVALID_JOB' | 'LEASE_EXPIRED';
export type NotificationMessage = Readonly<{ subject: string; text: string }>;
export interface NotificationSmtpTransport { send(recipient: string, message: NotificationMessage): Promise<void> }

type ClaimedJob = {
  id: string; orderId: string; kind: NotificationKind; recipient: string; payload: unknown;
  attemptCount: number; totalAttemptCount: number; version: number; leaseToken: string;
};
type Failure = { safeCode: SafeNotificationError; permanent: boolean };

export class NotificationDeliveryError extends Error {
  constructor(readonly safeCode: SafeNotificationError, readonly permanent: boolean) { super(safeCode); }
}

export function notificationMessage(kind: NotificationKind, payload: unknown): NotificationMessage | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const orderNumber = (payload as Record<string, unknown>).orderNumber;
  if (typeof orderNumber !== 'string' || !ORDER_NUMBER.test(orderNumber)) return null;
  const labels: Record<NotificationKind, string> = {
    ORDER_CREATED_BUYER: 'pedido recibido', ORDER_CREATED_ADMIN: 'pedido recibido',
    PAYMENT_CONFIRMED_BUYER: 'pago confirmado', PAYMENT_CONFIRMED_ADMIN: 'pago confirmado',
    ORDER_READY_BUYER: 'pedido listo', ORDER_CANCELLED_BUYER: 'pedido cancelado', ORDER_CANCELLED_ADMIN: 'pedido cancelado',
  };
  return Object.freeze({
    subject: `ABAR Electricidad DEMO: ${labels[kind]}`,
    text: `MENSAJE DE DEMOSTRACIÓN LOCAL (DEMO).\n\nEl pedido ${orderNumber} fue actualizado: ${labels[kind]}.\n\nNo es una comunicación comercial real.`,
  });
}

@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(NOTIFICATION_SMTP_TRANSPORT) private readonly transport: NotificationSmtpTransport,
    @Optional() @Inject(NOTIFICATION_CLOCK) private readonly now: () => Date = () => new Date(),
  ) {}

  async run(maxJobs = RUN_LIMIT): Promise<{ claimed: number; sent: number; failed: number; retried: number }> {
    if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > RUN_LIMIT) throw new TypeError('maxJobs must be an integer from 1 to 20');
    const host = this.config.get<string>('H6_SMTP_HOST') ?? '127.0.0.1';
    const port = this.config.get<number>('H6_SMTP_PORT') ?? 1025;
    if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
      return { claimed: 0, sent: 0, failed: 0, retried: 0 };
    }
    const outcome = { claimed: 0, sent: 0, failed: 0, retried: 0 };
    while (outcome.claimed < maxJobs) {
      const claimed = await this.claimOne();
      if (!claimed) break;
      outcome.claimed++;
      const message = notificationMessage(claimed.kind, claimed.payload);
      let failure: Failure | null = null;
      if (!message || !RECIPIENT.test(claimed.recipient)) {
        failure = { safeCode: 'INVALID_JOB', permanent: true };
      } else {
        try { await this.transport.send(claimed.recipient, message); }
        catch (error) { failure = this.failure(error); }
      }
      const result = await this.finish(claimed, failure);
      if (result === 'SENT') outcome.sent++;
      else if (result === 'FAILED') outcome.failed++;
      else if (result === 'RETRY_WAIT') outcome.retried++;
    }
    return outcome;
  }

  private failure(error: unknown): Failure {
    if (error instanceof NotificationDeliveryError) return { safeCode: error.safeCode, permanent: error.permanent };
    return { safeCode: 'SMTP_UNAVAILABLE', permanent: false };
  }

  private async claimOne(): Promise<ClaimedJob | null> {
    const leaseToken = randomUUID();
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          WITH expired_candidate AS (
            SELECT id FROM "NotificationJob"
            WHERE state = 'PROCESSING' AND "leaseUntil" <= now() AND "attemptCount" >= 5
            ORDER BY "leaseUntil", "createdAt", id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE "NotificationJob" AS job
          SET state = 'FAILED', version = version + 1, "lastError" = 'LEASE_EXPIRED',
              "nextAttemptAt" = NULL, "leaseToken" = NULL, "leaseUntil" = NULL
          FROM expired_candidate
          WHERE job.id = expired_candidate.id`;
        return tx.$queryRaw<ClaimedJob[]>`
        WITH candidate AS (
          SELECT id FROM "NotificationJob"
          WHERE "attemptCount" < 5 AND (
            (state IN ('PENDING', 'RETRY_WAIT') AND "nextAttemptAt" <= now()) OR
            (state = 'PROCESSING' AND "leaseUntil" <= now())
          )
          ORDER BY COALESCE("nextAttemptAt", "leaseUntil", "createdAt"), "createdAt", id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE "NotificationJob" AS job
        SET state = 'PROCESSING', version = version + 1,
            "attemptCount" = job."attemptCount" + 1,
            "totalAttemptCount" = job."totalAttemptCount" + 1,
            "lastAttemptAt" = now(), "nextAttemptAt" = NULL,
            "lastError" = CASE WHEN job.state = 'PROCESSING' THEN 'LEASE_EXPIRED' ELSE job."lastError" END,
            "leaseToken" = ${leaseToken}::uuid, "leaseUntil" = now() + interval '60 seconds'
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.id, job."orderId", job.kind, job.recipient, job.payload,
          job."attemptCount", job."totalAttemptCount", job.version, job."leaseToken"`;
      });
      return rows[0] ?? null;
    } catch {
      throw new NotificationDeliveryError('SMTP_UNAVAILABLE', false);
    }
  }

  private async finish(job: ClaimedJob, failure: Failure | null): Promise<'SENT' | 'RETRY_WAIT' | 'FAILED' | 'LOST'> {
    const now = this.now();
    const expired = job.attemptCount >= 5;
    const state = !failure ? 'SENT' : failure.permanent || expired ? 'FAILED' : 'RETRY_WAIT';
    const delay = state === 'RETRY_WAIT' ? BACKOFF_MS[Math.min(job.attemptCount - 1, BACKOFF_MS.length - 1)] : undefined;
    try {
      const result = await this.prisma.notificationJob.updateMany({
        where: { id: job.id, state: 'PROCESSING', leaseToken: job.leaseToken, version: job.version },
        data: {
          state, version: { increment: 1 }, sentAt: state === 'SENT' ? now : null,
          lastError: failure?.safeCode ?? null,
          nextAttemptAt: delay === undefined ? null : new Date(now.getTime() + delay),
          leaseToken: null, leaseUntil: null,
        },
      });
      return result.count === 1 ? state : 'LOST';
    } catch {
      // SMTP may already have accepted the message. Leaving PROCESSING for lease recovery is truthful;
      // the next attempt can duplicate delivery, which SMTP cannot make exactly-once.
      return 'LOST';
    }
  }
}

@Injectable()
export class LocalMailpitSmtpTransport implements NotificationSmtpTransport {
  constructor(private readonly config: ConfigService) {}

  async send(recipient: string, message: NotificationMessage): Promise<void> {
    const host = this.config.get<string>('H6_SMTP_HOST') ?? '127.0.0.1';
    const port = this.config.get<number>('H6_SMTP_PORT') ?? 1025;
    if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535 || !RECIPIENT.test(recipient)) {
      throw new NotificationDeliveryError('SMTP_UNAVAILABLE', false);
    }
    const socket = connect({ host: '127.0.0.1', port });
    const session = new SmtpSession(socket);
    const deadline = setTimeout(() => socket.destroy(new Error('deadline')), SMTP_DEADLINE_MS);
    deadline.unref?.();
    try {
      await session.connected();
      const greeting = await session.expect(220);
      if (!/\bMailpit\b/i.test(greeting.text)) {
        throw new NotificationDeliveryError('SMTP_REJECTED', true);
      }
      await session.command('EHLO localhost', 250);
      await session.command('MAIL FROM:<orders@example.test>', 250);
      await session.command(`RCPT TO:<${recipient}>`, [250, 251]);
      await session.command('DATA', 354);
      const body = `From: orders@example.test\r\nTo: ${recipient}\r\nSubject: ${message.subject}\r\n` +
        'MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n' +
        'Content-Transfer-Encoding: 8bit\r\n\r\n' + message.text.replace(/\r?\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..');
      socket.write(`${body}\r\n.\r\n`);
      await session.expect(250);
      socket.write('QUIT\r\n');
    } catch (error) {
      if (error instanceof NotificationDeliveryError) throw error;
      if (error instanceof SmtpResponseError) throw new NotificationDeliveryError('SMTP_REJECTED', error.code >= 500);
      throw new NotificationDeliveryError('SMTP_UNAVAILABLE', false);
    } finally {
      clearTimeout(deadline);
      socket.destroy();
    }
  }
}

class SmtpResponseError extends Error { constructor(readonly code: number) { super('SMTP_REJECTED'); } }

type SmtpReply = { code: number; text: string };

class SmtpSession {
  private buffer = '';
  private responses: SmtpReply[] = [];
  private responseLines: string[] = [];
  private waiter: ((reply: SmtpReply) => void) | null = null;
  private failure: ((error: Error) => void) | null = null;
  private terminalError: Error | null = null;
  private connectedPromise: Promise<void>;
  private connectedResolve!: () => void;
  private connectedReject!: (error: Error) => void;

  constructor(private readonly socket: Socket) {
    this.connectedPromise = new Promise((resolve, reject) => { this.connectedResolve = resolve; this.connectedReject = reject; });
    socket.on('connect', this.connectedResolve);
    socket.on('data', (chunk: Buffer) => this.read(chunk));
    socket.on('error', (error) => this.fail(new Error(error.message)));
    socket.on('close', () => this.fail(new Error('closed')));
  }
  connected(): Promise<void> { return this.connectedPromise; }
  async command(command: string, expected: number | number[]): Promise<void> {
    const response = this.expectAny(expected);
    this.socket.write(`${command}\r\n`);
    await response;
  }
  expect(code: number): Promise<SmtpReply> { return this.expectAny(code); }
  private expectAny(expected: number | number[]): Promise<SmtpReply> {
    return new Promise((resolve, reject) => {
      const codes = Array.isArray(expected) ? expected : [expected];
      const next = (reply: SmtpReply) => codes.includes(reply.code) ? resolve(reply) : reject(new SmtpResponseError(reply.code));
      const queued = this.responses.shift();
      if (queued !== undefined) next(queued);
      else if (this.terminalError) reject(this.terminalError);
      else { this.waiter = next; this.failure = reject; }
    });
  }
  private read(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    if (this.buffer.length > 8192) return this.fail(new Error('response too large'));
    const lines = this.buffer.split('\r\n'); this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const match = /^(\d{3})([ -])/.exec(line);
      if (!match) return this.fail(new Error('malformed response'));
      this.responseLines.push(line.slice(4));
      if (match[2] === '-') continue;
      const reply = { code: Number(match[1]), text: this.responseLines.join('\n') };
      this.responseLines = [];
      if (this.waiter) { const waiter = this.waiter; this.waiter = null; this.failure = null; waiter(reply); }
      else {
        if (this.responses.length >= 16) return this.fail(new Error('response queue full'));
        this.responses.push(reply);
      }
    }
  }
  private fail(error: Error): void {
    this.terminalError ??= error;
    this.connectedReject(error);
    const reject = this.failure; this.failure = null; this.waiter = null;
    reject?.(error);
  }
}
