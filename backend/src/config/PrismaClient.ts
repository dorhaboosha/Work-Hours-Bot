import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { Env } from "@/config/Env";

const adapter = new PrismaPg(
  {
    connectionString: Env.DATABASE_URL,
    // Small personal bot on a constrained (often free-tier) Postgres plan —
    // cap the pool explicitly rather than relying on pg's default (10),
    // which is easy to exhaust once the web server, bot, and background
    // jobs all share this one process.
    max: 5,
  },
  {
    onPoolError: (err) => console.error("[Prisma] Postgres pool error:", err),
  }
);

export const prisma = new PrismaClient({ adapter });

/**
 * A Prisma client or an interactive-transaction client — accepted by
 * repository functions that may run either standalone or inside
 * prisma.$transaction(async (tx) => { ... }).
 */
export type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;
