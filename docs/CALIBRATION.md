# T0–T4 Calibration — CAL-2026.08-A

Generated from `src/config/calibration.ts`. Hash `f51d6e3ddf96064a72419845ebae6243`.

| Field | Value |
|---|---|
| Scope | GROUP (single group-wide table) |
| Currency | IDR |
| Revenue anchor | Rp 500.000.000 / month |
| Basis | Group-wide provisional scale — under Rp 500 juta monthly revenue (single/low-multi outlet SME & restaurant). |
| Effective from | 2026-08-01 |
| Review cadence | QUARTERLY |
| Approved by | **PENDING — CFO (R36), Risk & Control Owner (R03), Executive Sponsor (R01)** |

> Every amount below is derived from the revenue anchor. Change the anchor and the whole matrix moves coherently; no threshold is an independent constant.

## 1. Amount ladders

| Profile | T0 ≤ | T1 ≤ | T2 ≤ | T3 ≤ | T4 |
|---|---:|---:|---:|---:|---:|
| OPERATIONAL | Rp 1.000.000 | Rp 5.000.000 | Rp 15.000.000 | Rp 50.000.000 | above |
| COMMITMENT | Rp 500.000 | Rp 7.500.000 | Rp 25.000.000 | Rp 75.000.000 | above |
| CASH_OUT | — | — | Rp 5.000.000 | Rp 25.000.000 | above |
| REVENUE_CONCESSION | Rp 250.000 | Rp 2.000.000 | Rp 10.000.000 | Rp 30.000.000 | above |
| PEOPLE | — | Rp 5.000.000 | Rp 15.000.000 | Rp 40.000.000 | above |
| MASTER | — | above | — | — | — |
| POS_VARIANCE | Rp 25.000 | Rp 150.000 | Rp 750.000 | above | — |
| FLAT_T4 | — | — | — | — | above |

`—` means the band is not reachable for that profile: cash-out never clears below T2, and restricted families are T4 only.

## 2. Percentage thresholds

| Rule | Value |
|---|---|
| Discount ladder | ≤5%→T0 · ≤10%→T1 · ≤20%→T2 · ≤35%→T3 · ≤∞%→T4 |
| Margin floor → T3 | 35% |
| Margin critical → T4 | 20% |
| Budget variance → T2 / T3 | 10% / 25% |
| PO↔bill price tolerance | 2% (→T1 above, T2 >5%, T3 >10%) |
| Receipt qty tolerance | 0% |
| Shrink/scrap → T2 / T3 | 3% / 8% |

## 3. Party & product class floors

| Dimension | STANDARD | NEW | SOLE_SOURCE | RESTRICTED |
|---|---|---|---|---|
| vendor | — | T2 | T3 | T4 |
| customer | — | T1 | T3 | T4 |
| product | — | T1 | T3 | T4 |

## 4. Legal & tax floors

| Trigger | Minimum band |
|---|---|
| crossBorderPayment | T4 |
| taxSensitivePosting | T3 |
| withholdingAdjustment | T3 |
| statutoryReport | T3 |
| personalDataDisclosure | T3 |
| contractDeviation | T3 |
| regulatedGoods | T4 |

## 5. Site & shift

| Site | Amount factor | Business hours | POS variance ladder |
|---|---:|---|---|
| RESTO-01 | ×1 | 06:00–23:00 | group default |
| RESTO-02 | ×0.6 | 07:00–22:00 | T0≤Rp 15.000 · T1≤Rp 100.000 · T2≤Rp 500.000 · T3≤∞ |
| KIOSK-01 | ×0.4 | 08:00–21:00 | group default |
| HO | ×1 | 08:00–18:00 | group default |

Off-hours escalation: +1 band for CASH_OUT, REVENUE_CONCESSION, POS_VARIANCE raised outside the site's business hours. An explicit per-site ladder is absolute and is never additionally scaled by the amount factor.

## 6. Family routing

| Family | Name | Ladder | Min band | Triggers | Quorum T1/T2/T3/T4 | SLA (h) | SoD |
|---|---|---|---|---|---|---:|---|
| AR01 | Customer/vendor create or merge | MASTER | — | restricted→T3, merge→T3 | 1/1/1/2 | 24 | SOD13 |
| AR02 | Customer credit/payment profile | COMMITMENT | — | overrideCreditHold→T3 | 1/1/1/2 | 24 | SOD13 |
| AR03 | Supplier qualification/status | MASTER | — | restricted→T3 | 1/1/1/2 | 48 | SOD13 |
| AR04 | Party bank account change | FLAT_T4 | — | — | 1/1/1/2 | 8 | SOD01 |
| AR05 | Product/UoM/category activation | MASTER | — | restricted→T3 | 1/1/1/2 | 48 | SOD13 |
| AR06 | Price/discount/margin | REVENUE_CONCESSION | — | — | 1/1/1/2 | 8 | SOD04 |
| AR07 | Nonstandard terms/contract | COMMITMENT | T3 | — | 1/1/1/2 | 48 | SOD04 |
| AR08 | Order hold release/cancel/reopen | OPERATIONAL | — | reopen→T3 | 1/1/1/2 | 8 | SOD04 |
| AR09 | Requisition/budget/urgency | OPERATIONAL | — | emergency→T2 | 1/1/1/2 | 24 | SOD02 |
| AR10 | PO commitment/change | COMMITMENT | — | offContract→T3 | 1/1/1/2 | 24 | SOD02 |
| AR11 | Receipt/3-way-match exception | COMMITMENT | — | qtyException→T1, missingReceipt→T3, duplicateSuspect→T3 | 1/1/1/2 | 24 | SOD02, SOD03 |
| AR12 | Inventory adjustment/scrap | OPERATIONAL | — | — | 1/1/1/2 | 24 | SOD03 |
| AR13 | BOM/routing/spec release | MASTER | T2 | criticalSpec→T4 | 1/1/1/2 | 72 | SOD05 |
| AR14 | MO release/priority/substitution | OPERATIONAL | T1 | — | 1/1/1/2 | 8 | SOD05 |
| AR15 | Quality concession/rework/scrap | OPERATIONAL | T2 | criticalClass→T4 | 1/1/1/2 | 24 | SOD06 |
| AR16 | Maintenance emergency/downtime/cost | COMMITMENT | — | safety→T4 | 1/1/1/2 | 4 | — |
| AR17 | Invoice/credit note/refund | REVENUE_CONCESSION | — | postSettlement→T3 | 1/1/1/2 | 24 | SOD04 |
| AR18 | Manual journal/adjustment | CASH_OUT | — | restrictedAccount→T4, priorPeriod→T4 | 1/1/1/2 | 24 | SOD07 |
| AR19 | Payment batch | CASH_OUT | — | newBankAccount→T4 | 1/1/1/2 | 8 | SOD01, SOD08 |
| AR20 | Period close/reopen | FLAT_T4 | — | — | 1/1/1/2 | 4 | SOD07 |
| AR21 | Hire/offer/compensation | PEOPLE | — | aboveBand→T3 | 1/1/1/2 | 48 | SOD10 |
| AR22 | Leave/overtime/time/expense | OPERATIONAL | — | — | 1/1/1/2 | 24 | — |
| AR23 | Payroll release/payment | FLAT_T4 | — | — | 1/1/1/2 | 8 | SOD09 |
| AR24 | Project baseline/change/milestone | COMMITMENT | — | — | 1/1/1/2 | 48 | — |
| AR25 | Refund/concession/case remedy | REVENUE_CONCESSION | — | — | 1/1/1/2 | 8 | SOD04 |
| AR25P | POS session variance | POS_VARIANCE | — | — | 1/1/1/2 | 12 | — |
| AR26 | User/role/privileged access | MASTER | T2 | privileged→T4, breakGlass→T4 | 1/1/1/2 | 8 | SOD11 |
| AR27 | Configuration/customization/release | MASTER | T2 | production→T3 | 1/1/1/2 | 24 | SOD12 |
| AR28 | Interface/schema/KPI rule | MASTER | T2 | breakingChange→T3 | 1/1/1/2 | 48 | SOD14 |

## 7. Resolution order

Each step may only RAISE the band, never lower it, and each raise is recorded in `ApprovalRequest.bandDrivers`:

1. Amount ladder (site factor applied)
2. Family minimum band
3. Percentages — discount, margin, budget variance, price variance, shrink
4. Party / product class floor
5. Legal & tax floor
6. Family boolean triggers
7. Off-hours escalation

T0 quorum = 0 (system validation + maker accountability). T4 quorum = 2 and the second approver must hold a different role. Timeout never auto-approves.
