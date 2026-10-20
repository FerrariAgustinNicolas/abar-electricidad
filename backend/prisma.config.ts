// Default discovery must never select the application's database or a fallback.
throw new Error(
  'Default Prisma CLI configuration is disabled. Use an explicit approved config.',
);

export {};
