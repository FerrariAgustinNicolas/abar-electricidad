import { Test } from '@nestjs/testing';
import { validateAuthConfig } from './auth.config';
import { AUTH_RUNTIME, type AuthRuntime } from './auth-runtime.module';
import { AuthModule } from './auth.module';
import { ChangePasswordService, type ChangePasswordDependencies } from './change-password.service';
import { CSRF_NONCE_CIPHER, CsrfService } from './csrf.service';
import { LoginService } from './login.service';
import { LogoutService } from './logout.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';

// Preserve public service readers while wrapping construction to observe the DI factory arguments.
jest.mock('./change-password.service', () => {
  const actual = jest.requireActual('./change-password.service');
  return {
    ...actual,
    ChangePasswordService: jest.fn((dependencies: unknown) =>
      new actual.ChangePasswordService(dependencies)),
  };
});

// AuthRuntimeModule is overridden so importing this module never reads env or packaged files.
jest.mock('argon2', () => ({ argon2id: 2, hash: jest.fn(), verify: jest.fn() }));

describe('AuthModule change-password dependency wiring', () => {
  it('constructs the service with the shared runtime resources and injected clock/entropy', async () => {
    const config = validateAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: 'http://127.0.0.1:4200' });
    const blocklist = { hasDigest: jest.fn(() => false) };
    const hasher = { verify: jest.fn(async () => true), hash: jest.fn(async () => 'synthetic-hash') };
    const runtime = Object.freeze({ config, blocklist, hasher }) as unknown as AuthRuntime;
    const prisma = {
      authSession: { findUnique: jest.fn() }, adminUser: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const cipher = {
      available: true, decrypt: jest.fn(), encrypt: jest.fn(),
    };

    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(AUTH_RUNTIME).useValue(runtime)
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(CSRF_NONCE_CIPHER).useValue(cipher)
      .overrideProvider(CsrfService).useValue({})
      .overrideProvider(LoginService).useValue({})
      .overrideProvider(LogoutService).useValue({})
      .overrideProvider(SessionService).useValue({})
      .compile();
    try {
      const service = module.get(ChangePasswordService, { strict: false });
      const constructor = ChangePasswordService as unknown as jest.Mock;
      expect(constructor).toHaveBeenCalledTimes(1);
      const [dependencies] = constructor.mock.calls[0] as [ChangePasswordDependencies];
      expect(dependencies.prisma).toBe(prisma);
      expect(dependencies.hasher).toBe(hasher);
      expect(dependencies.blocklist).toBe(blocklist);
      expect(dependencies.cipher).toBe(cipher);
      expect(dependencies.config).toBe(config);
      expect(typeof dependencies.now).toBe('function');
      expect(typeof dependencies.randomBytes).toBe('function');
      expect(service).toBeDefined();
    } finally {
      await module.close();
    }
  });
});
