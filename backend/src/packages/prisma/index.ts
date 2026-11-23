// Save as: backend/src/packages/prisma/index.ts
// This must be the ONLY place in the backend that creates a PrismaClient.
import "dotenv/config"; // Prisma 7 does not load .env by itself
import { PrismaClient } from "../../../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Fail loudly at startup instead of getting a vague database error later.
  throw new Error("DATABASE_URL is missing. Check backend/.env and where the server is started from.");
}

// Hosted databases such as AWS RDS often require SSL.
// Add DB_SSL=true to backend/.env if you get an SSL or "no pg_hba.conf entry" error.
const useSsl = process.env.DB_SSL === "true";

const adapter = new PrismaPg({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

// Reuse one client even when the dev server reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;