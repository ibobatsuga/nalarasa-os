/**
 * Scope evidence. Reads the Odoo export and ranks every model by real usage:
 * row count, last write date, and activity in the last 90 days.
 *
 *   npx tsx src/tools/usage-profile.ts ./export/db1 ./export/db2 ./export/db3
 *
 * Output: a markdown table plus a BUILD / DEFER / DROP recommendation per model.
 * "All modules are used" becomes a measurable claim instead of an opinion.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = process.argv.slice(2);
if (DIRS.length === 0) throw new Error('Usage: usage-profile.ts <exportDir> [...]');

const DATE_FIELDS = ['write_date', 'create_date', 'date_order', 'date', 'invoice_date'];
const RECENT_DAYS = 90;
const now = Date.now();

interface Profile {
  model: string;
  rows: number;
  lastWrite: string | null;
  recentRows: number;
  dbs: string[];
}

const byModel = new Map<string, Profile>();

for (const dir of DIRS) {
  if (!existsSync(dir)) { process.stderr.write(`skip missing ${dir}\n`); continue; }
  const db = dir.split('/').filter(Boolean).pop()!;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { model: string; rows?: Record<string, unknown>[] };
    const rows = parsed.rows ?? [];
    const p = byModel.get(parsed.model) ?? { model: parsed.model, rows: 0, lastWrite: null, recentRows: 0, dbs: [] };
    p.rows += rows.length;
    if (!p.dbs.includes(db)) p.dbs.push(db);
    for (const r of rows) {
      const field = DATE_FIELDS.find((f) => typeof r[f] === 'string');
      if (!field) continue;
      const d = String(r[field]);
      if (!p.lastWrite || d > p.lastWrite) p.lastWrite = d;
      if (now - Date.parse(d.replace(' ', 'T') + 'Z') < RECENT_DAYS * 86_400_000) p.recentRows++;
    }
    byModel.set(parsed.model, p);
  }
}

/** Evidence-based scope call. Recency beats volume: dead history is not usage. */
function verdict(p: Profile): { call: 'BUILD' | 'DEFER' | 'DROP'; why: string } {
  if (p.rows === 0) return { call: 'DROP', why: 'no records at all' };
  if (p.recentRows === 0) return { call: 'DROP', why: `no write in ${RECENT_DAYS} days` };
  if (p.recentRows < 10) return { call: 'DEFER', why: `only ${p.recentRows} recent records — spreadsheet first` };
  return { call: 'BUILD', why: `${p.recentRows} records in ${RECENT_DAYS} days` };
}

const profiles = [...byModel.values()].sort((a, b) => b.recentRows - a.recentRows || b.rows - a.rows);
const counts = { BUILD: 0, DEFER: 0, DROP: 0 };

const out: string[] = [];
out.push('# Scope evidence — actual Odoo usage');
out.push('');
out.push(`Sources: ${DIRS.join(', ')}. Recency window: ${RECENT_DAYS} days.`);
out.push('');
out.push('| Model | Rows | Recent | Last write | DBs | Call | Why |');
out.push('|---|---:|---:|---|---|---|---|');
for (const p of profiles) {
  const v = verdict(p);
  counts[v.call]++;
  out.push(`| ${p.model} | ${p.rows} | ${p.recentRows} | ${p.lastWrite ?? '—'} | ${p.dbs.join(' ')} | **${v.call}** | ${v.why} |`);
}
out.push('');
out.push(`**${counts.BUILD} BUILD · ${counts.DEFER} DEFER · ${counts.DROP} DROP** out of ${profiles.length} models.`);
out.push('');
out.push('BUILD goes into the 12-week plan. DEFER runs on a spreadsheet until month 4. DROP is not rebuilt.');

console.log(out.join('\n'));
