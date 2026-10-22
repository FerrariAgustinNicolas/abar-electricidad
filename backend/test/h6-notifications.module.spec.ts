import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AdminUsersService } from '../src/auth/admin-users.service';
import { AUTH_RUNTIME } from '../src/auth/auth-runtime.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationDispatcher } from '../src/notifications/notification-dispatcher';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationsService } from '../src/notifications/notifications.service';

describe('NotificationsModule dependency injection', () => {
  it('constructs the actual module providers with explicit clock and SMTP tokens', async () => {
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ H6_SMTP_HOST: '127.0.0.1', H6_SMTP_PORT: 1025 })] }),
      NotificationsModule,
    ] })
      .overrideProvider(AUTH_RUNTIME).useValue({ config: {}, hasher: { hash: async () => 'unused' }, blocklist: { hasDigest: () => false } })
      .overrideProvider(PrismaService).useValue({ notificationJob: {} })
      .overrideProvider(AdminUsersService).useValue({ authorizeCatalog: jest.fn() })
      .compile();

    expect(module.get(NotificationDispatcher)).toBeInstanceOf(NotificationDispatcher);
    expect(module.get(NotificationsService)).toBeInstanceOf(NotificationsService);
    await module.close();
  });
});
