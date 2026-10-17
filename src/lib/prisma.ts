import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function initPrismaClient(): PrismaClient {
  const tursoUrl =
    process.env.TURSO_DATABASE_URL ||
    (process.env.DATABASE_URL?.startsWith('libsql://') || process.env.DATABASE_URL?.startsWith('https://')
      ? process.env.DATABASE_URL
      : undefined);
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && authToken && (tursoUrl.startsWith('libsql://') || tursoUrl.startsWith('https://'))) {
    // Resilient fetch wrapper with retry on transient network hiccups/socket drops
    const resilientFetch = async (input: any, init?: any) => {
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        attempts++;
        try {
          return await fetch(input, init);
        } catch (err) {
          if (attempts >= maxAttempts) throw err;
          await new Promise((r) => setTimeout(r, 150 * attempts));
        }
      }
      return fetch(input, init);
    };

    const client = createClient({
      url: tursoUrl,
      authToken: authToken,
      fetch: resilientFetch,
    });
    const adapter = new PrismaLibSQL(client);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? initPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
