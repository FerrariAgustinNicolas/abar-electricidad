import { Module } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_RUNTIME, AuthRuntimeModule } from './auth-runtime.module';
import { AuthController } from './auth.controller';
import { LoginService } from './login.service';
import { LogoutService } from './logout.service';
import { CsrfNonceCipher, createCsrfNonceCipher } from './csrf-nonce.cipher';
import { CSRF_NONCE_CIPHER, CsrfService } from './csrf.service';
import { SessionService } from './session.service';
import { ChangePasswordService } from './change-password.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AuthRuntimeModule, PrismaModule],
  controllers: [AuthController, AdminUsersController],
  providers: [
    {
      provide: CSRF_NONCE_CIPHER,
      useFactory: (): CsrfNonceCipher => createCsrfNonceCipher({ AUTH_CSRF_ENCRYPTION_KEY: process.env.AUTH_CSRF_ENCRYPTION_KEY }),
    },
    {
      provide: CsrfService,
      useFactory: (prisma, cipher, runtime) => new CsrfService(prisma, cipher, runtime.config),
      inject: [PrismaService, CSRF_NONCE_CIPHER, AUTH_RUNTIME],
    },
    {
      provide: SessionService,
      useFactory: (prisma, cipher, runtime) => new SessionService(prisma, cipher, runtime.config),
      inject: [PrismaService, CSRF_NONCE_CIPHER, AUTH_RUNTIME],
    },
    {
      provide: LoginService,
      useFactory: (prisma, cipher, runtime) => new LoginService({
        prisma, cipher, config: runtime.config, hasher: runtime.hasher,
      }),
      inject: [PrismaService, CSRF_NONCE_CIPHER, AUTH_RUNTIME],
    },
    {
      provide: LogoutService,
      useFactory: (prisma, cipher, runtime) => new LogoutService(prisma, cipher, runtime.config),
      inject: [PrismaService, CSRF_NONCE_CIPHER, AUTH_RUNTIME],
    },
    {
      provide: AdminUsersService,
      useFactory: (prisma, cipher, runtime) => new AdminUsersService(
        prisma, cipher, runtime.config, runtime.hasher, runtime.blocklist,
      ),
      inject: [PrismaService, CSRF_NONCE_CIPHER, AUTH_RUNTIME],
    },
    {
      provide: ChangePasswordService,
      useFactory: (prisma, cipher, runtime) => new ChangePasswordService({
        prisma,
        cipher,
        config: runtime.config,
        hasher: runtime.hasher,
        blocklist: runtime.blocklist,
        now: Date.now,
        randomBytes,
      }),
      inject: [PrismaService, CSRF_NONCE_CIPHER, AUTH_RUNTIME],
    },
  ],
  exports: [CsrfService, AdminUsersService],
})
export class AuthModule {}
