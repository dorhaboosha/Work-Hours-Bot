import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Env } from "@/config/Env";

const adapter = new PrismaPg({ connectionString: Env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
