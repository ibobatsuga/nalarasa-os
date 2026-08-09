import { PrismaClient } from '@prisma/client';
import { installTenantGuard } from './tenant.js';

export const prisma = new PrismaClient();

// Tenant isolation is installed once, here. No service filters by tenant itself.
installTenantGuard(prisma);

/** Prisma transaction client type used across services. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
