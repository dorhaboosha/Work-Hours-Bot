import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { Env } from "@/config/Env";

const adapter = new PrismaPg({ connectionString: Env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

/**
 * A Prisma client or an interactive-transaction client — accepted by
 * repository functions that may run either standalone or inside
 * prisma.$transaction(async (tx) => { ... }).
 */
export type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;
