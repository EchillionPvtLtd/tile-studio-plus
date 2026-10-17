import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createClient } from '@libsql/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function cleanEnv(val?: string): string {
  if (!val) return '';
  let s = val.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function initPrismaClient(): PrismaClient {
  let tursoUrl = cleanEnv(process.env.TURSO_DATABASE_URL);
  let authToken = cleanEnv(process.env.TURSO_AUTH_TOKEN);

  const rawDbUrl = cleanEnv(process.env.DATABASE_URL);
  if (!tursoUrl && (rawDbUrl.startsWith('libsql://') || rawDbUrl.startsWith('https://') || rawDbUrl.includes('turso.io'))) {
    tursoUrl = rawDbUrl;
  }

  // Prisma SQLite provider strictly requires DATABASE_URL to start with "file:".
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('file:')) {
    process.env.DATABASE_URL = 'file:./dev.db';
  }

  const isRemoteTurso = tursoUrl.startsWith('libsql://') || tursoUrl.startsWith('https://');

  if (process.env.NODE_ENV === 'production' && (!isRemoteTurso || !authToken)) {
    throw new Error(
      `Turso database configuration missing in Vercel! TURSO_DATABASE_URL: ${tursoUrl ? 'FOUND (' + tursoUrl.slice(0, 15) + '...)' : 'MISSING'}, TURSO_AUTH_TOKEN: ${authToken ? 'FOUND (length ' + authToken.length + ')' : 'MISSING'}. Ensure both are added in Vercel Settings -> Environment Variables.`
    );
  }

  if (isRemoteTurso && authToken) {
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
