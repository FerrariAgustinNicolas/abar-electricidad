import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { loadPasswordBlocklist } from './password-blocklist';
import { AuthConfig, validateAuthConfig } from './auth.config';
import { PasswordBlocklistLookup } from './password-policy';
import { PasswordHasher } from './password-hasher';

export const AUTH_RUNTIME = Symbol('AUTH_RUNTIME');
export type AuthRuntime = Readonly<{
  config: AuthConfig;
  blocklist: PasswordBlocklistLookup;
  hasher: PasswordHasher;
}>;

@Module({
  providers: [{
    provide: AUTH_RUNTIME,
    useFactory: (): AuthRuntime => {
      const config = validateAuthConfig({ ...process.env });
      // The same code-owned packaged path works from both src/auth and dist/auth.
      const blocklist = loadPasswordBlocklist(resolve(__dirname, '../../dist/resources/auth'));
      const hasher = new PasswordHasher(config);
      // The queue is mutable; only the cohesive runtime wrapper is frozen here.
      return Object.freeze({ config, blocklist, hasher });
    },
  }],
  exports: [AUTH_RUNTIME],
})
export class AuthRuntimeModule {}
