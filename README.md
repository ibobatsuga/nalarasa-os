# Nalarasa OS

Multi-tenant ERP for UMKM, restaurants and cafes. Control spine first, modules on top.

Node 20 · TypeScript (strict) · Fastify · Prisma/PostgreSQL · Zod · React + Tailwind.

```bash
cp .env.example .env
npm install && npx prisma generate && npm run db:push && npm run db:seed
npm run dev            # API  :3000
cd web && npm install && npm run dev   # dashboard :5173
npm test               # control-logic tests (bands, SoD, default deny)
```

## Layout

```
prisma/schema.prisma        MD01–MD34 masters, approval spine, audit, KPI snapshots
src/config/functions.ts     function catalogue — the unit of RBAC and SoD
src/config/roles.ts         R01–R51 business roles + grants + band ceiling
src/config/sod.ts           SOD01–SOD14 (static sides + runtime chains)
src/config/approval-families.ts  AR01–AR28 + T0–T4 ladders, triggers, quorum
src/core/                   types, errors, canonical hash, state machine, audit, controller
src/iam/                    rbac (default deny), sod.service (static + dynamic)
src/approval/               band resolution, request/decide, dual control
src/domains/o2c|p2p|r2r/    machines + services per value stream
src/masters/                MD09/10/12/13/18/20 schemas + services
src/kpi/                    K-definitions, computers, lineage, snapshot/certify
src/core/tenant.ts          tenant context + Prisma isolation guard
src/tenancy/provision.ts    tenant provisioning, plans, quotas, suspension
src/iam/auth.ts             login, sessions, password policy
src/iam/jml.ts              joiner / mover / leaver / recertification
src/tools/                  odoo-export, usage-profile, calibration-sheet
src/http/                   tenant + actor resolution, error mapping, routes
web/                        executive dashboard (KPI tiles + approvals + SoD)
```

## Multi-tenancy

One Postgres, `tenantId` on every business table, isolation enforced **once** in
[core/tenant.ts](src/core/tenant.ts) — no service ever writes a tenant filter, so
a forgotten `where` cannot leak data. Nested creates are stamped recursively.

- Tenant resolved per request from the subdomain (`warungbudi.nalarasa.os`) or
  `x-tenant` in development, before authentication — even the login lookup is scoped.
- `runAsSystem()` is the only bypass: session-token lookup, provisioning, platform admin.
- Any query on a scoped model outside a tenant context throws `NO_TENANT_CONTEXT`.
- `Role` (R01–R51) and `Credential` are deliberately global.

Plans: STARTER 5 users / 1 site · GROWTH 25 / 5 · BUSINESS 100 / 20.
Limits are checked at provisioning and on every user create. Suspension freezes
access and kills sessions; nothing is ever hard-deleted.

Calibration is **per tenant** (`TenantCalibration`), versioned and superseded, never
deleted. The code sheet is only the template every new tenant is seeded from.

```bash
curl -X POST localhost:3000/platform/tenants -d '{"slug":"warung-budi", ...}'
```

## Non-negotiables (enforced in code)

| Rule | Where |
|---|---|
| Default deny | `iam/rbac.assertCan` — no grant, no action |
| RBAC by role, never user | `UserRole` → `Role.code` → `config/roles.ts` grants |
| Least privilege | grants are explicit; wildcards expand against the catalogue |
| No self-approval | `approval.service.decide` (maker ≠ approver, one decision per actor per version) |
| Zero hard-delete | no DELETE route; `DocStatus` transitions; corrections are reversing entries |
| SoD | `sod.service.evaluateRoleSet` (static) + `assertChain` (runtime, audit-sourced) |
| Version binding | `core/hash.versionHash` on every request, decision, and audit row |
| Toxic role fail-fast | `server.ts` refuses to boot if a single role holds both sides of an SoD rule |

## T0–T4 calibration

Calibrated group-wide, IDR, version `CAL-2026.08-A` — see [docs/CALIBRATION.md](docs/CALIBRATION.md)
(generated from code by `npm run calibration:sheet`; `GET /meta/calibration` serves the same data).

Every amount derives from **one anchor**: `ANCHOR.monthlyRevenue = Rp 500.000.000`
(the "under Rp 500 jt/month" scale). Change the anchor and the whole matrix moves.

| Profile | T0 ≤ | T1 ≤ | T2 ≤ | T3 ≤ | T4 |
|---|---:|---:|---:|---:|---:|
| OPERATIONAL — requisition, expense, adjustment | 1 jt | 5 jt | 15 jt | 50 jt | above |
| COMMITMENT — PO, contract, project | 500 rb | 7,5 jt | 25 jt | 75 jt | above |
| CASH_OUT — payment batch, manual journal | — | — | 5 jt | 25 jt | above |
| REVENUE_CONCESSION — discount, credit note, refund | 250 rb | 2 jt | 10 jt | 30 jt | above |
| PEOPLE — hire, compensation | — | 5 jt | 15 jt | 40 jt | above |
| POS_VARIANCE — cash count | 25 rb | 150 rb | 750 rb | above | — |
| MASTER / FLAT_T4 | class-driven / always T4 |

Money leaving the company never auto-clears: CASH_OUT starts at T2.

`resolveBand(family, ctx)` applies seven steps, each of which may only **raise**
the band, and records every raise in `ApprovalRequest.bandDrivers`:

1. **Amount** ladder × site factor
2. **Family floor** (`minBand`: change control and access never below T2)
3. **Percentages** — discount 5/10/20/35%, margin floor 35% → T3 and 20% → T4,
   budget variance 10/25%, PO↔bill price 2% tolerance then 5/10%, shrink 3/8%
4. **Party/product class** — vendor NEW→T2, SOLE_SOURCE→T3, RESTRICTED→T4;
   customer CREDIT_HOLD→T3; product CONTROLLED→T3
5. **Legal/tax** — cross-border payment→T4, regulated goods→T4, tax-sensitive
   posting / withholding / statutory report / personal-data disclosure→T3
6. **Family triggers** — restrictedAccount, priorPeriod, newBankAccount, privileged…
7. **Off-hours** — +1 band for cash-out, concessions and POS variance raised
   outside the site's business hours

Sites: `RESTO-01` ×1.0 (06–23), `RESTO-02` ×0.6 (07–22, own POS ladder),
`KIOSK-01` ×0.4 (08–21), `HO` ×1.0 (08–18). A site with an explicit ladder is
absolute and is not additionally scaled.

T0 quorum = 0 (system validation / maker accountability). T4 quorum = 2 **and**
the second approver must hold a different role. Timeout never auto-approves —
`expireOverdue()` moves the request to `EXPIRED`. Always-T4 families: AR04 bank
change, AR20 period reopen, AR23 payroll release.

Each request stores `calibrationVersion` + `calibrationHash`, so a decision made
under an old calibration stays reproducible after the next re-calibration.
Boundary values are tested at the ceiling and one rupiah above in
[test/calibration.test.ts](test/calibration.test.ts).

**Still required:** sign-off by CFO (R36), Risk & Control Owner (R03) and
Executive Sponsor (R01) — `ANCHOR.approvedBy` is `null` until then. Review cadence quarterly.

## Hard-coded SoD chains

| Rule | Chain (same document, different actors) |
|---|---|
| SOD01 | `party.bank.change` → `party.bank.verify` → `party.bank.approve`; and none of them may approve/release a batch paying that account |
| SOD07 | `journal.prepare` ≠ `journal.approve` ≠ `journal.post` |
| SOD08 | `payment.prepare` ≠ `payment.approve` ≠ `payment.release` ≠ `payment.reconcile` |
| SOD09 | `payroll.run` ≠ `payroll.approve` ≠ `payroll.pay` |

Chains are evaluated against the append-only `AuditEvent` log, so they hold
across sessions, delegation, and role changes. Violations write a `SodConflict`
row before the request is refused — K05/K63 see every attempt.

## Value streams

**O2C / POS / Subscription (SOP02–SOP04)**
`createOrder → submitOrder (AR06: amount, discount ≥20%, margin <15%) → confirmOrder
→ reserve → deliver (POD mandatory) → bill (auto-invoice) → settle`.
POS: `openPosSession → addPosOrder → closePosSession` computes cash variance and
routes AR25P by magnitude; `reconcileGateway` matches settlement rows to
`PosOrder.gatewayRef` (MATCHED / UNMATCHED / AMOUNT_MISMATCH).

**P2P (SOP05–SOP07)**
`createRequisition → submit (AR09) → createPurchaseOrder → submit (AR10: new vendor,
off-contract) → createReceipt → putaway (dock-to-stock stamp) → createBill
(3-way match runs on create) → submitBill (AR11 by exception type) →
preparePaymentBatch → submit (AR19) → approve → release → reconcile`.
`threeWayMatch` returns `MATCHED | QTY_EXCEPTION | PRICE_EXCEPTION | MISSING_RECEIPT | DUPLICATE`
with per-line deltas; 2% price tolerance, zero over-receipt tolerance.

**R2R (SOP12)**
`postSubledgerEvent` (T0 straight-through) vs `createJournal → submitJournal
(AR18: restricted account, prior period) → postJournal → reverseJournal`.
Balanced-entry check, period gate on every post, `lockPeriod` refuses to lock
with unposted journals, `requestReopen`/`executeReopen` is AR20 T4.
`reconcileBank` matches statement lines to released payment batches.

## KPI semantic layer

`GET /kpi/executive?companyId&from&to` → K01, K02, K03, K04, K05, K47.
Also implemented: K17, K20, K37, K40, K43, K44, K63.
Each result carries `lineage {formula, sources, filters, components, inputHash}`;
`POST /kpi/snapshot` persists it and `POST /kpi/snapshots/:id/certify` applies
SOD14 (definer ≠ certifier). K03's DIO uses a received-value-minus-COGS proxy —
stated explicitly in `lineage.components.assumption` until a perpetual stock
ledger exists. K05 weights: SoD clean 0.30, approval on time 0.20, match first
pass 0.20, bank reconciled 0.15, period locked 0.15.

## Backlog

Utang teknis, fitur tertunda, dan daftar aplikasi terpisah yang masih perlu
dibuat ada di [BACKLOG.md](BACKLOG.md). Jangan tambah fitur baru sebelum
membaca bagian A — beberapa peran operasional belum punya aplikasi sama sekali.

## Re-calibrating

Edit [src/config/calibration.ts](src/config/calibration.ts) only — routing logic
in `approval-families.ts` never carries numbers. Then:

```bash
npm test && npm run calibration:sheet > docs/CALIBRATION.md
```

Bump `CALIBRATION_VERSION` on any change; the hash moves automatically and old
approvals keep their original stamp. `POST /approvals/simulate-band` dry-runs any
context against the live calibration before you commit to it.
