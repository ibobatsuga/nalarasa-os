export interface KpiResult {
  code: string; name: string; version: string;
  unit: 'RATIO' | 'PERCENT' | 'DAYS' | 'CURRENCY' | 'COUNT';
  value: number | null; numerator: number | null; denominator: number | null; target: number | null;
  lineage: { formula: string; sources: string[]; filters: Record<string, unknown>; components?: Record<string, unknown>; inputHash: string };
}

export interface ApprovalRequest {
  id: string; familyCode: string; band: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
  requiredCount: number; docType: string; docId: string;
  amount: string | null; currency: string | null; versionHash: string;
  makerId: string; makerRole: string; dueAt: string | null;
  bandDrivers?: string[];
  decisions: { actorId: string; roleCode: string; decision: string }[];
}

export interface SodConflict {
  id: string; ruleId: string; scope: string; subjectId: string;
  detail: Record<string, unknown>; detectedAt: string;
}

const BASE = '/api';

export const session = {
  tenant: localStorage.getItem('tenant') ?? 'horison-emerald',
  token: localStorage.getItem('token') ?? '',
  companyId: localStorage.getItem('companyId') ?? '',
  user: localStorage.getItem('user') ?? 'Admin',
};

export function saveSession(patch: Partial<typeof session>): void {
  Object.assign(session, patch);
  for (const [k, v] of Object.entries(patch)) localStorage.setItem(k, String(v));
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-tenant': session.tenant,
      ...(session.token ? { authorization: `Bearer ${session.token}` } : {}),
      ...(session.companyId ? { 'x-company-id': session.companyId } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
    throw new Error(body.message ?? body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (subjectId: string, password: string) =>
    call<{ token: string; mustChange: boolean; actor: { userId: string } }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ subjectId, password }),
    }),
  executive: (companyId: string, from: string, to: string) =>
    call<KpiResult[]>(`/kpi/executive?companyId=${companyId}&from=${from}&to=${to}`),
  pendingApprovals: () => call<ApprovalRequest[]>('/approvals/pending'),
  conflicts: () => call<SodConflict[]>('/iam/sod/conflicts'),
  audit: (docType: string, docId: string) => call<AuditEvent[]>(`/audit/${docType}/${docId}`),
  decide: (body: { requestId: string; decision: string; reasonCode: string; versionHash: string }) =>
    call('/approvals/decide', { method: 'POST', body: JSON.stringify(body) }),
};

export interface AuditEvent {
  id: string; at: string; actorId: string; roleCode: string | null;
  action: string; docType: string; docId: string; toStatus: string | null;
}

// ─── formatting ───────────────────────────────────────────────────────────────

export const rupiah = (n: number, compact = false) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
    notation: compact ? 'compact' : 'standard',
  }).format(n);

export function formatKpi(k: KpiResult): string {
  if (k.value === null) return '—';
  switch (k.unit) {
    case 'PERCENT':
    case 'RATIO': return `${(k.value * 100).toFixed(1)}%`;
    case 'DAYS': return `${k.value.toFixed(1)} hari`;
    case 'COUNT': return String(k.value);
    case 'CURRENCY': return rupiah(k.value, true);
  }
}
