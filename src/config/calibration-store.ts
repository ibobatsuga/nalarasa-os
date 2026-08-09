import { prisma } from '../core/db.js';
import { currentTenant, runAsSystem } from '../core/tenant.js';
import { calibrationSheet } from './calibration.js';

export type CalibrationSheet = ReturnType<typeof calibrationSheet>;

/** The code sheet is the product default — the template every new tenant starts from. */
export const DEFAULT_SHEET: CalibrationSheet = calibrationSheet();

const cache = new Map<string, CalibrationSheet>();

/** Loads a tenant's active calibration into the sync cache. Called per request. */
export async function loadCalibration(tenantId: string): Promise<CalibrationSheet> {
  const cached = cache.get(tenantId);
  if (cached) return cached;
  const row = await runAsSystem(() => prisma.tenantCalibration.findFirst({
    where: { tenantId, supersededAt: null },
    orderBy: { effectiveFrom: 'desc' },
  }));
  const sheet = (row?.sheet as CalibrationSheet | undefined) ?? DEFAULT_SHEET;
  cache.set(tenantId, sheet);
  return sheet;
}

export const invalidateCalibration = (tenantId: string): void => { cache.delete(tenantId); };

/**
 * Synchronous accessor used by band resolution. Falls back to the product
 * default outside a tenant context (tests, tooling, platform admin).
 */
export function activeSheet(): CalibrationSheet {
  const ctx = currentTenant();
  if (!ctx || ctx.system) return DEFAULT_SHEET;
  return cache.get(ctx.tenantId) ?? DEFAULT_SHEET;
}

/** Publishes a new calibration version and supersedes the previous one. */
export async function publishCalibration(
  tenantId: string, sheet: CalibrationSheet, createdBy: string,
): Promise<void> {
  await runAsSystem(async () => {
    await prisma.tenantCalibration.updateMany({
      where: { tenantId, supersededAt: null }, data: { supersededAt: new Date() },
    });
    await prisma.tenantCalibration.create({
      data: { tenantId, version: sheet.version, hash: sheet.hash, sheet: sheet as object, createdBy },
    });
  });
  invalidateCalibration(tenantId);
}
