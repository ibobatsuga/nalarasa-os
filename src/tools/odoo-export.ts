/**
 * Odoo full-data export — run BEFORE the contract ends. Read-only.
 *
 *   ODOO_URL=https://xxx.odoo.com ODOO_DB=dbname ODOO_USER=email ODOO_KEY=apikey \
 *   npx tsx src/tools/odoo-export.ts ./export/<dbname>
 *
 * Writes one JSON + one CSV per model, plus a manifest with row counts and a
 * SHA-256 per file. Resumable: existing complete files are skipped.
 * Uses Odoo's JSON-RPC endpoint; no extra dependency.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL_ = must('ODOO_URL').replace(/\/$/, '');
const DB = must('ODOO_DB');
const USER = must('ODOO_USER');
const KEY = must('ODOO_KEY');
const OUT = process.argv[2] ?? `./export/${DB}`;
const PAGE = 500;

function must(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
}

/** Models in dependency order. Add any module you actually use. */
const MODELS: Array<{ model: string; fields?: string[] }> = [
  { model: 'res.company' },
  { model: 'res.currency' },
  { model: 'res.users', fields: ['id', 'login', 'name', 'active', 'company_id', 'groups_id', 'partner_id'] },
  { model: 'res.groups', fields: ['id', 'name', 'category_id', 'users'] },
  { model: 'res.partner' },
  { model: 'res.partner.bank' },
  { model: 'uom.uom' },
  { model: 'uom.category' },
  { model: 'product.category' },
  { model: 'product.template' },
  { model: 'product.product' },
  { model: 'product.pricelist' },
  { model: 'product.pricelist.item' },
  { model: 'account.tax' },
  { model: 'account.account' },
  { model: 'account.journal' },
  { model: 'account.fiscal.position' },
  { model: 'account.payment.term' },
  { model: 'account.move' },
  { model: 'account.move.line' },
  { model: 'account.payment' },
  { model: 'account.bank.statement' },
  { model: 'account.bank.statement.line' },
  { model: 'account.analytic.account' },
  { model: 'account.analytic.line' },
  { model: 'crm.lead' },
  { model: 'sale.order' },
  { model: 'sale.order.line' },
  { model: 'purchase.order' },
  { model: 'purchase.order.line' },
  { model: 'stock.warehouse' },
  { model: 'stock.location' },
  { model: 'stock.picking' },
  { model: 'stock.move' },
  { model: 'stock.move.line' },
  { model: 'stock.quant' },
  { model: 'stock.lot' },
  { model: 'mrp.bom' },
  { model: 'mrp.bom.line' },
  { model: 'mrp.production' },
  { model: 'pos.config' },
  { model: 'pos.session' },
  { model: 'pos.order' },
  { model: 'pos.order.line' },
  { model: 'pos.payment' },
  { model: 'pos.payment.method' },
  { model: 'hr.employee' },
  { model: 'hr.contract' },
  { model: 'hr.payslip' },
  { model: 'hr.payslip.line' },
  { model: 'hr.leave' },
  { model: 'hr.attendance' },
  { model: 'project.project' },
  { model: 'project.task' },
  { model: 'helpdesk.ticket' },
  { model: 'maintenance.equipment' },
  { model: 'maintenance.request' },
  { model: 'ir.attachment', fields: ['id', 'name', 'res_model', 'res_id', 'mimetype', 'file_size', 'checksum', 'create_date'] },
];

let uid = 0;

async function rpc(service: string, method: string, args: unknown[]): Promise<any> {
  const res = await fetch(`${URL_}/jsonrpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  });
  const body = await res.json() as { result?: unknown; error?: { data?: { message?: string } } };
  if (body.error) throw new Error(body.error.data?.message ?? JSON.stringify(body.error));
  return body.result;
}

const call = (model: string, method: string, args: unknown[], kwargs: object = {}) =>
  rpc('object', 'execute_kw', [DB, uid, KEY, model, method, args, kwargs]);

/** Odoo returns [id, display_name] for m2o and id arrays for x2m. */
function flatten(v: unknown): string {
  if (v === false || v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    if (v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'string') return `${v[0]}|${v[1]}`;
    return v.join(';');
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const csvCell = (v: unknown) => {
  const s = flatten(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}

async function exportModel(model: string, fields?: string[]) {
  const jsonPath = join(OUT, `${model}.json`);
  if (existsSync(jsonPath)) {
    const prev = JSON.parse(readFileSync(jsonPath, 'utf8')) as { complete?: boolean; rows?: unknown[] };
    if (prev.complete) return { model, rows: prev.rows?.length ?? 0, skipped: true };
  }

  let total: number;
  try {
    total = await call(model, 'search_count', [[]], { context: { active_test: false } });
  } catch (e) {
    return { model, rows: 0, error: (e as Error).message }; // module not installed
  }

  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < total; offset += PAGE) {
    const kwargs: Record<string, unknown> = { offset, limit: PAGE, order: 'id', context: { active_test: false } };
    if (fields) kwargs.fields = fields;
    const page = await call(model, 'search_read', [[]], kwargs);
    rows.push(...page);
    process.stderr.write(`\r${model}: ${rows.length}/${total}   `);
  }
  process.stderr.write('\n');

  writeFileSync(jsonPath, JSON.stringify({ model, exportedAt: new Date().toISOString(), complete: true, rows }, null, 1));
  writeFileSync(join(OUT, `${model}.csv`), toCsv(rows));
  const hash = createHash('sha256').update(readFileSync(jsonPath)).digest('hex');
  return { model, rows: rows.length, sha256: hash };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  uid = await rpc('common', 'login', [DB, USER, KEY]);
  if (!uid) throw new Error('Login failed — check ODOO_DB / ODOO_USER / ODOO_KEY');
  process.stderr.write(`Logged in as uid=${uid} on ${DB}\n`);

  const manifest: unknown[] = [];
  for (const m of MODELS) manifest.push(await exportModel(m.model, m.fields));

  writeFileSync(join(OUT, '_manifest.json'), JSON.stringify({
    db: DB, url: URL_, exportedAt: new Date().toISOString(), models: manifest,
  }, null, 2));

  const ok = manifest.filter((m) => !(m as { error?: string }).error);
  const failed = manifest.filter((m) => (m as { error?: string }).error);
  process.stderr.write(`\nDone. ${ok.length} models exported, ${failed.length} unavailable.\n`);
  process.stderr.write(`Manifest: ${join(OUT, '_manifest.json')}\n`);
}

main().catch((e) => { process.stderr.write(`\nEXPORT FAILED: ${e.message}\n`); process.exit(1); });
