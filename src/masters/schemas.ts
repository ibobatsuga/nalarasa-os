import { z } from 'zod';

/** MD09 Customer / MD10 Vendor — one Party model, `kind` discriminates. */
export const PartySchema = z.object({
  code: z.string().regex(/^[A-Z0-9._-]{3,32}$/),
  kind: z.enum(['CUSTOMER', 'VENDOR', 'BOTH']),
  legalName: z.string().min(2).max(200),
  taxId: z.string().max(32).optional(),
  creditLimit: z.number().nonnegative().default(0),
  paymentTerm: z.string().max(32).optional(), // MD16
  restricted: z.boolean().default(false),
});
export type PartySchema = z.infer<typeof PartySchema>;

/** MD20 Bank Account — raw account number is accepted, never stored. */
export const BankAccountSchema = z.object({
  partyId: z.string(),
  bankCode: z.string().min(2).max(20),
  accountNo: z.string().min(6).max(34),
  holderName: z.string().min(2).max(140),
  currency: z.string().length(3).default('IDR'),
  effectiveFrom: z.coerce.date().optional(),
});
export type BankAccountSchema = z.infer<typeof BankAccountSchema>;

/** MD13 Unit of Measure */
export const UomSchema = z.object({
  code: z.string().min(1).max(16),
  name: z.string().min(1).max(64),
  category: z.string().min(1).max(32),
  factor: z.number().positive().default(1),
});

/** MD12 Product / Service */
export const ProductSchema = z.object({
  code: z.string().regex(/^[A-Z0-9._-]{2,32}$/),
  name: z.string().min(2).max(200),
  kind: z.enum(['GOODS', 'SERVICE', 'RECURRING']).default('GOODS'),
  category: z.string().min(1).max(64),
  uomId: z.string(),
  stdCost: z.number().nonnegative().default(0),
  listPrice: z.number().nonnegative().default(0),
  taxCode: z.string().max(16).optional(), // MD15
});

/** MD18 Chart of Accounts / Journal */
export const AccountSchema = z.object({
  code: z.string().regex(/^[0-9A-Z.-]{3,20}$/),
  name: z.string().min(2).max(140),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  journalCode: z.string().max(16).optional(),
  restricted: z.boolean().default(false),
});

/** JSON-Schema export for external consumers / interface contracts (MD34). */
export const MASTER_SCHEMAS = {
  MD09_MD10_Party: PartySchema,
  MD20_BankAccount: BankAccountSchema,
  MD13_Uom: UomSchema,
  MD12_Product: ProductSchema,
  MD18_Account: AccountSchema,
} as const;
