import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../src/core/db.js';
import { runAsSystem, withTenant } from '../../src/core/tenant.js';
import { ControlError } from '../../src/core/errors.js';
import type { Actor } from '../../src/core/types.js';
import { decide } from '../../src/approval/approval.service.js';
import * as p2p from '../../src/domains/p2p/service.js';
import * as r2r from '../../src/domains/r2r/service.js';
import * as o2c from '../../src/domains/o2c/service.js';
import * as masters from '../../src/masters/service.js';
import { joiner, leaver } from '../../src/iam/jml.js';

/**
 * Tes integrasi terhadap Postgres SUNGGUHAN (PGlite via TCP).
 *
 * Bukan mock. Setiap assertion di bawah melewati query planner, constraint,
 * unique index, dan transaksi Postgres yang asli. Jalankan lebih dulu:
 *
 *   npm run pg:dev &&  npm run db:push  &&  npm run db:seed
 *   npm run test:integration
 *
 * Separuh berkas ini sengaja menguji hal-hal yang HARUS GAGAL. Kontrol yang
 * tidak pernah diuji dengan cara dilanggar bukanlah kontrol — hanya dekorasi.
 */

let ctx: { tenantId: string; slug: string };
let companyId: string;
let siteId: string;
const aktor: Record<string, Actor> = {};

const tenant = <T>(fn: () => Promise<T>) => withTenant(ctx, fn);

/** Gagal kalau blok TIDAK melempar, atau melempar dengan kode berbeda. */
async function harusDitolak(kode: string, fn: () => Promise<unknown>): Promise<ControlError> {
  try {
    await fn();
  } catch (e) {
    const err = e as ControlError;
    assert.equal(err.code, kode, `diharapkan ${kode}, dapat ${err.code}: ${err.message}`);
    return err;
  }
  assert.fail(`operasi berhasil padahal harus ditolak dengan ${kode}`);
}

before(async () => {
  const t = await runAsSystem(() => prisma.tenant.findUnique({ where: { slug: 'horison-emerald' } }));
  assert.ok(t, 'seed belum dijalankan — jalankan npm run db:seed');
  ctx = { tenantId: t.id, slug: t.slug };

  await tenant(async () => {
    const c = await prisma.company.findFirstOrThrow();
    companyId = c.id;
    siteId = (await prisma.site.findFirstOrThrow({ where: { code: 'RESTO-01' } })).id;

    const users = await prisma.user.findMany({ include: { roles: { include: { role: true } } } });
    for (const u of users) {
      aktor[u.subjectId] = { userId: u.id, roleCodes: u.roles.map((r) => r.role.code), companyId, siteId };
    }
  });
  assert.ok(aktor['u.cfo'], 'aktor seed tidak lengkap');
});

after(async () => { await prisma.$disconnect(); });

// ─── 1. golden transaction: P2P sampai pembayaran ─────────────────────────────

describe('P2P — requisisi sampai pembayaran', () => {
  let poId = '';
  let billId = '';

  test('vendor dibuat steward, disetujui data owner (SOD13)', async () => {
    await tenant(async () => {
      const { party } = await masters.createParty(aktor['u.steward']!, {
        code: `VEN-${Date.now()}`, kind: 'VENDOR', legalName: 'CV Uji Integrasi',
        creditLimit: 0, restricted: false,
      });
      // Pembuat tidak boleh mengaktifkan sendiri. Di sini RBAC memblokir lebih
      // dulu daripada SoD: tidak ada peran pembuat yang memegang party.approve,
      // jadi swa-persetujuan mustahil secara struktur, bukan sekadar dilarang.
      await harusDitolak('ACCESS_DENIED', () => masters.activateParty(aktor['u.steward']!, party.id));
      const aktif = await masters.activateParty(aktor['u.dataowner']!, party.id);
      assert.equal(aktif.status, 'ACTIVE');

      const po = await p2p.createPurchaseOrder(aktor['u.buyer']!, {
        companyId, vendorId: party.id, currency: 'IDR', offContract: false,
        lines: [{ productId: 'p1', qty: 10, unitPrice: 200_000 }],
      });
      poId = po.id;
      assert.equal(Number(po.total), 2_000_000);
    });
  });

  test('PO diajukan buyer, band naik karena vendor baru', async () => {
    await tenant(async () => {
      const hasil = await p2p.submitPurchaseOrder(aktor['u.buyer']!, poId) as { approvalId: string | null };
      const req = await prisma.approvalRequest.findFirstOrThrow({
        where: { docType: 'PurchaseOrder', docId: poId },
      });
      // Rp 2 jt = T1 pada ladder COMMITMENT, tapi vendor NEW memaksa T2.
      assert.equal(req.band, 'T2', `band ${req.band}, drivers: ${req.bandDrivers.join(' | ')}`);
      assert.ok(req.bandDrivers.some((d) => d.includes('vendor:NEW')));
      assert.ok(hasil);
    });
  });

  test('buyer tidak memegang po.approve sama sekali', async () => {
    await tenant(async () => {
      const req = await prisma.approvalRequest.findFirstOrThrow({
        where: { docType: 'PurchaseOrder', docId: poId, status: 'PENDING' },
      });
      await harusDitolak('ACCESS_DENIED', () => decide({
        requestId: req.id, decision: 'APPROVE', reasonCode: 'WITHIN_POLICY',
        versionHash: req.versionHash,
      }, aktor['u.buyer']!));
    });
  });

  /**
   * Maker dan checker terpisah secara struktur untuk PO: manajer pengadaan
   * memegang po.approve tapi tidak po.create, jadi ia tidak punya dokumen
   * sendiri untuk disetujui. Swa-persetujuan baru bisa terjadi kalau satu orang
   * merangkap dua sisi — itu yang diuji di sini, langsung ke mesin persetujuan.
   */
  test('penyiap sekaligus penyetuju tetap kena SELF_APPROVAL', async () => {
    await tenant(async () => {
      // R34 (ubah rekening) + R36 (CFO, band T4, setujui rekening).
      const rangkap = await joiner(aktor['u.iam']!, {
        subjectId: `u.rangkap2.${Date.now()}`, displayName: 'Pemilik Merangkap Bendahara',
        companyId, siteId, roleCodes: ['R34', 'R36'],
        sodMitigation: 'Perubahan rekening dikonfirmasi lisan ke vendor oleh supervisor',
      });
      const dia: Actor = { userId: rangkap.user.id, roleCodes: ['R34', 'R36'], companyId, siteId };

      const vendor = await prisma.party.findFirstOrThrow({ where: { kind: 'VENDOR', status: 'ACTIVE' } });
      const bank = await masters.requestBankChange(dia, {
        partyId: vendor.id, bankCode: 'MANDIRI', accountNo: `77${Date.now()}`,
        holderName: 'Uji Swa-Persetujuan', currency: 'IDR',
      });
      await masters.verifyBankChange(aktor['u.treasappr']!, bank.id, 'CALLBACK-SELF');

      const req = await prisma.approvalRequest.findFirstOrThrow({
        where: { docType: 'BankAccount', docId: bank.id, status: 'PENDING' },
      });
      // RBAC lolos, band cukup, SoD statis sudah dimitigasi. Yang tersisa hanya
      // aturan "tidak boleh menyetujui dokumen sendiri".
      await harusDitolak('SELF_APPROVAL', () => decide({
        requestId: req.id, decision: 'APPROVE', reasonCode: 'WITHIN_POLICY',
        versionHash: req.versionHash,
      }, dia));
    });
  });

  test('manajer pengadaan menyetujui, PO terbit', async () => {
    await tenant(async () => {
      const req = await prisma.approvalRequest.findFirstOrThrow({
        where: { docType: 'PurchaseOrder', docId: poId, status: 'PENDING' },
      });
      const hasil = await decide({
        requestId: req.id, decision: 'APPROVE', reasonCode: 'WITHIN_POLICY',
        versionHash: req.versionHash,
      }, aktor['u.procmgr']!);
      assert.equal(hasil.status, 'APPROVED');

      await prisma.purchaseOrder.update({ where: { id: poId }, data: { status: 'EXECUTED' } });
    });
  });

  test('3-way match menangkap selisih harga di atas toleransi', async () => {
    await tenant(async () => {
      const po = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: poId }, include: { lines: true } });
      const line = po.lines[0]!;

      const gr = await p2p.createReceipt(aktor['u.receiver']!, {
        poId, siteId, lines: [{ poLineId: line.id, qtyAccepted: 10, qtyRejected: 0 }],
      });
      await prisma.goodsReceipt.update({ where: { id: gr.id }, data: { status: 'EXECUTED' } });

      // Vendor menagih Rp 260.000/unit padahal PO Rp 200.000 — selisih 30%.
      const { match } = await p2p.createBill(aktor['u.ap']!, {
        poId, vendorId: po.vendorId, companyId,
        docNo: `INV-UJI-${Date.now()}`, billDate: new Date(),
        lines: [{ poLineId: line.id, productId: 'p1', qty: 10, unitPrice: 260_000 }],
      });
      assert.equal(match.result, 'PRICE_EXCEPTION');
      assert.equal(match.firstPass, false);
      assert.ok(match.exceptions.some((e) => e.kind === 'PRICE' && e.delta === 30));

      billId = (await prisma.vendorBill.findFirstOrThrow({ orderBy: { createdAt: 'desc' } })).id;
    });
  });

  test('tagihan duplikat ditolak', async () => {
    await tenant(async () => {
      const asli = await prisma.vendorBill.findFirstOrThrow({ where: { id: billId } });
      const err = await harusDitolak('DUPLICATE_BILL', () => p2p.createBill(aktor['u.ap']!, {
        poId, vendorId: asli.vendorId, companyId,
        docNo: asli.docNo, billDate: new Date(),
        lines: [{ productId: 'p1', qty: 10, unitPrice: 260_000 }],
      }));
      assert.equal(err.detail.existingBillId, asli.id);
      assert.equal(err.httpStatus, 409);

      const jejak = await prisma.auditEvent.findFirst({
        where: { action: 'bill.duplicate.blocked', docId: asli.id },
      });
      assert.ok(jejak, 'penolakan faktur ganda tidak meninggalkan jejak audit');
    });
  });
});

// ─── 2. SOD08: rantai pembayaran ──────────────────────────────────────────────

describe('SOD08 — penyiap pembayaran bukan perilis', () => {
  let batchId = '';
  let vendorId = '';

  test('batch disiapkan treasury preparer', async () => {
    await tenant(async () => {
      const bill = await prisma.vendorBill.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
      await prisma.vendorBill.update({ where: { id: bill.id }, data: { status: 'EXECUTED' } });
      vendorId = bill.vendorId;

      // SOD01 melarang penyiap pembayaran mendaftarkan rekening penerimanya.
      // Karena hanya R34 yang memegang party.bank.change, tenant WAJIB punya
      // dua pemegangnya — kalau tidak, tak satu pun pembayaran vendor bisa
      // disiapkan. Itu konsekuensi nyata untuk outlet berawak tipis.
      const pendaftar = await joiner(aktor['u.iam']!, {
        subjectId: `u.bank.${Date.now()}`, displayName: 'Admin Rekening',
        companyId, siteId, roleCodes: ['R34'],
      });
      const dia: Actor = { userId: pendaftar.user.id, roleCodes: ['R34'], companyId, siteId };

      // Nomor rekening unik per tenant: satu rekening tidak boleh menempel ke
      // dua vendor. Angka tetap akan bentrok dengan data seed.
      const bank = await masters.requestBankChange(dia, {
        partyId: bill.vendorId, bankCode: 'BCA', accountNo: `12${Date.now()}`,
        holderName: 'CV Uji Integrasi', currency: 'IDR',
      });
      await prisma.bankAccount.update({ where: { id: bank.id }, data: { status: 'ACTIVE' } });

      const batch = await p2p.preparePaymentBatch(aktor['u.treasprep']!, companyId, [bill.id]);
      batchId = batch.id;
      assert.ok(Number(batch.total) > 0);
      await p2p.submitPaymentBatch(aktor['u.treasprep']!, batchId);
    });
  });

  test('penyiap tidak memegang payment.approve', async () => {
    await tenant(async () => {
      await harusDitolak('ACCESS_DENIED',
        () => p2p.approvePaymentBatch(aktor['u.treasprep']!, batchId));
    });
  });

  /**
   * Kasus UMKM lagi: satu orang memegang R34 dan R35. RBAC lolos, jadi satu-
   * satunya yang tersisa adalah rantai dinamis. Ia menyiapkan batch, lalu
   * mencoba menyetujuinya sendiri.
   */
  test('pemegang R34+R35 dihentikan rantai dinamis SOD08', async () => {
    await tenant(async () => {
      const rangkap = await joiner(aktor['u.iam']!, {
        subjectId: `u.kas.${Date.now()}`, displayName: 'Bendahara Merangkap',
        companyId, siteId, roleCodes: ['R34', 'R35'],
        sodMitigation: 'Mutasi bank direview pemilik setiap akhir hari',
      });
      const dia: Actor = { userId: rangkap.user.id, roleCodes: ['R34', 'R35'], companyId, siteId };

      // Tagihan baru untuk vendor yang rekeningnya sudah aktif di tes pertama.
      const { bill } = await p2p.createBill(aktor['u.ap']!, {
        vendorId, companyId, docNo: `INV-SOD08-${Date.now()}`, billDate: new Date(),
        lines: [{ productId: 'p1', qty: 1, unitPrice: 400_000 }],
      });
      await prisma.vendorBill.update({ where: { id: bill.id }, data: { status: 'EXECUTED' } });

      const batch = await p2p.preparePaymentBatch(dia, companyId, [bill.id]);
      await p2p.submitPaymentBatch(dia, batch.id);

      const err = await harusDitolak('SOD_VIOLATION', () => p2p.approvePaymentBatch(dia, batch.id));
      assert.equal(err.detail.ruleId, 'SOD08');

      const konflik = await prisma.sodConflict.findFirst({
        where: { scope: 'DYNAMIC', ruleId: 'SOD08', subjectId: batch.id },
      });
      assert.ok(konflik, 'pelanggaran SoD tidak meninggalkan jejak');
    });
  });
});

// ─── 3. SOD07: jurnal ─────────────────────────────────────────────────────────

describe('SOD07 — penyiap jurnal bukan pemosting', () => {
  let jeId = '';

  test('jurnal manual disiapkan akuntan', async () => {
    await tenant(async () => {
      const [kas, beban] = await Promise.all([
        prisma.account.findFirstOrThrow({ where: { code: '1-1100' } }),
        prisma.account.findFirstOrThrow({ where: { code: '5-1000' } }),
      ]);
      const { entry } = await r2r.createJournal(aktor['u.gl']!, {
        companyId, journalCode: 'JV', postingDate: new Date(), source: 'MANUAL',
        memo: 'Uji integrasi',
        lines: [
          { accountId: beban.id, debit: 1_000_000, credit: 0 },
          { accountId: kas.id, debit: 0, credit: 1_000_000 },
        ],
      });
      jeId = entry.id;
      await r2r.submitJournal(aktor['u.gl']!, jeId);
    });
  });

  test('jurnal tidak seimbang ditolak', async () => {
    await tenant(async () => {
      const [kas, beban] = await Promise.all([
        prisma.account.findFirstOrThrow({ where: { code: '1-1100' } }),
        prisma.account.findFirstOrThrow({ where: { code: '5-1000' } }),
      ]);
      await harusDitolak('UNBALANCED', () => r2r.createJournal(aktor['u.gl']!, {
        companyId, journalCode: 'JV', postingDate: new Date(), source: 'MANUAL',
        lines: [
          { accountId: beban.id, debit: 1_000_000, credit: 0 },
          { accountId: kas.id, debit: 0, credit: 999_999 },
        ],
      }));
    });
  });

  test('akun kas berstatus restricted memaksa T4', async () => {
    await tenant(async () => {
      const req = await prisma.approvalRequest.findFirstOrThrow({
        where: { docType: 'JournalEntry', docId: jeId },
      });
      assert.equal(req.band, 'T4', `drivers: ${req.bandDrivers.join(' | ')}`);
      assert.equal(req.requiredCount, 2, 'T4 wajib dua penyetuju independen');
    });
  });

  test('akuntan penyiap sama sekali tidak memegang journal.post', async () => {
    await tenant(async () => {
      await prisma.journalEntry.update({ where: { id: jeId }, data: { status: 'APPROVED' } });
      await harusDitolak('ACCESS_DENIED', () => r2r.postJournal(aktor['u.gl']!, jeId));
    });
  });

  /**
   * Kasus sungguhan untuk UMKM: satu orang memegang R32 dan R33 sekaligus,
   * diterima lewat SodPolicy.SMALL_BUSINESS dengan mitigasi tertulis. RBAC
   * tidak lagi memblokir — yang tersisa hanya rantai dinamis. Kalau rantai itu
   * bocor, pemilik warung bisa menyiapkan sekaligus memposting jurnalnya.
   */
  test('pemegang peran rangkap tetap dihentikan rantai dinamis SOD07', async () => {
    await tenant(async () => {
      const rangkap = await joiner(aktor['u.iam']!, {
        subjectId: `u.rangkap.${Date.now()}`, displayName: 'Pemilik Merangkap Akuntan',
        companyId, siteId, roleCodes: ['R32', 'R33'],
        sodMitigation: 'Pemilik mereview mutasi bank harian bersama supervisor outlet',
      });
      const dia: Actor = { userId: rangkap.user.id, roleCodes: ['R32', 'R33'], companyId, siteId };

      const [kas, beban] = await Promise.all([
        prisma.account.findFirstOrThrow({ where: { code: '1-1100' } }),
        prisma.account.findFirstOrThrow({ where: { code: '5-1000' } }),
      ]);
      const { entry } = await r2r.createJournal(dia, {
        companyId, journalCode: 'JV', postingDate: new Date(), source: 'MANUAL',
        memo: 'Disiapkan oleh pemegang peran rangkap',
        lines: [
          { accountId: beban.id, debit: 250_000, credit: 0 },
          { accountId: kas.id, debit: 0, credit: 250_000 },
        ],
      });
      await r2r.submitJournal(dia, entry.id);
      await prisma.journalEntry.update({ where: { id: entry.id }, data: { status: 'APPROVED' } });

      const err = await harusDitolak('SOD_VIOLATION', () => r2r.postJournal(dia, entry.id));
      assert.equal(err.detail.ruleId, 'SOD07');
    });
  });
});

// ─── 4. T4 dua penyetuju: uji balapan ─────────────────────────────────────────

describe('T4 — kuorum dua penyetuju di bawah balapan', () => {
  test('dua penyetuju serentak tetap menghasilkan APPROVED', async () => {
    await tenant(async () => {
      const vendor = await prisma.party.findFirstOrThrow({ where: { kind: 'VENDOR' } });
      const bank = await masters.requestBankChange(aktor['u.treasprep']!, {
        partyId: vendor.id, bankCode: 'BNI', accountNo: `999${Date.now()}`,
        holderName: 'Uji Balapan', currency: 'IDR',
      });
      // Verifikator harus berbeda dari pembuat (SOD01).
      await masters.verifyBankChange(aktor['u.treasappr']!, bank.id, 'CALLBACK-001');

      const req = await prisma.approvalRequest.findFirstOrThrow({
        where: { docType: 'BankAccount', docId: bank.id, status: 'PENDING' },
      });
      assert.equal(req.band, 'T4');
      assert.equal(req.requiredCount, 2);

      const putusan = (a: Actor) => decide({
        requestId: req.id, decision: 'APPROVE', reasonCode: 'WITHIN_POLICY',
        versionHash: req.versionHash,
      }, a).catch((e) => e as ControlError);

      // Dua penyetuju independen menekan tombol pada saat yang sama.
      // Keduanya wajib benar-benar memegang party.bank.approve — kalau salah
      // satu ditolak RBAC, balapannya tidak pernah terjadi dan tes ini bohong.
      const [a, b] = await Promise.all([putusan(aktor['u.cfo']!), putusan(aktor['u.owner']!)]);

      const akhir = await prisma.approvalRequest.findFirstOrThrow({ where: { id: req.id } });
      const suara = await prisma.approvalDecision.count({
        where: { requestId: req.id, decision: 'APPROVE' },
      });

      assert.equal(suara, 2, `hanya ${suara} suara tercatat (a=${JSON.stringify(a)}, b=${JSON.stringify(b)})`);
      assert.equal(akhir.status, 'APPROVED',
        `dua suara masuk tapi status ${akhir.status} — kuorum hilang karena balapan`);
    });
  });
});

// ─── 5. default deny + isolasi tenant ─────────────────────────────────────────

describe('Batas akses', () => {
  test('kasir tidak boleh memposting jurnal', async () => {
    await tenant(async () => {
      await harusDitolak('ACCESS_DENIED', () => r2r.postJournal(aktor['u.cashier']!, 'apa-saja'));
    });
  });

  test('kasir tidak boleh merilis pembayaran', async () => {
    await tenant(async () => {
      await harusDitolak('ACCESS_DENIED',
        () => p2p.releasePaymentBatch(aktor['u.cashier']!, 'apa-saja', 'REF'));
    });
  });

  test('query tanpa konteks tenant ditolak', async () => {
    await harusDitolak('NO_TENANT_CONTEXT', () => prisma.party.findMany());
  });

  test('tenant lain tidak melihat data tenant ini', async () => {
    const lain = await runAsSystem(() => prisma.tenant.create({
      data: { slug: `uji-isolasi-${Date.now()}`, name: 'Tenant Uji' },
    }));
    const jumlahDiTenantLain = await withTenant(
      { tenantId: lain.id, slug: lain.slug },
      () => prisma.party.count(),
    );
    const jumlahDiSini = await tenant(() => prisma.party.count());

    assert.equal(jumlahDiTenantLain, 0, 'data bocor lintas tenant');
    assert.ok(jumlahDiSini > 0, 'data tenant sendiri justru tidak terlihat');
  });
});

// ─── 6. JML: peran bertabrakan dan pencabutan ────────────────────────────────

describe('JML', () => {
  test('peran bertabrakan tanpa mitigasi ditolak', async () => {
    await tenant(async () => {
      await harusDitolak('MITIGATION_REQUIRED', () => joiner(aktor['u.iam']!, {
        subjectId: `u.uji.${Date.now()}`, displayName: 'Uji Rangkap',
        companyId, siteId, roleCodes: ['R32', 'R33'],
      }));
    });
  });

  test('peran bertabrakan dengan mitigasi diterima dan dicatat', async () => {
    await tenant(async () => {
      const hasil = await joiner(aktor['u.iam']!, {
        subjectId: `u.pemilik.${Date.now()}`, displayName: 'Pemilik Warung',
        companyId, siteId, roleCodes: ['R32', 'R33'],
        sodMitigation: 'Pemilik mereview laporan kas harian bersama supervisor',
      });
      assert.deepEqual(hasil.acceptedConflicts, ['SOD07']);

      const konflik = await prisma.sodConflict.findFirst({
        where: { subjectId: hasil.user.id, status: 'ACCEPTED' },
      });
      assert.ok(konflik?.mitigation, 'mitigasi tidak tersimpan');
    });
  });

  test('leaver mencabut peran, sesi, dan mengunci kredensial', async () => {
    await tenant(async () => {
      const baru = await joiner(aktor['u.iam']!, {
        subjectId: `u.keluar.${Date.now()}`, displayName: 'Akan Keluar',
        companyId, siteId, roleCodes: ['R12'],
      });
      const hasil = await leaver(aktor['u.iam']!, baru.user.id);

      assert.ok(hasil.rolesRevoked >= 1);
      assert.equal(hasil.user.status, 'ARCHIVED');
      assert.ok(hasil.user.accessRevokedAt, 'K48 tidak bisa dihitung tanpa accessRevokedAt');

      const aktifTersisa = await prisma.userRole.count({
        where: { userId: baru.user.id, revokedAt: null },
      });
      assert.equal(aktifTersisa, 0, 'masih ada peran aktif setelah keluar');
    });
  });
});

// ─── 7. POS: sesi, selisih kas, idempotensi ──────────────────────────────────

describe('POS', () => {
  test('sesi ditutup, selisih dirutekan ke persetujuan', async () => {
    await tenant(async () => {
      const sesi = await o2c.openPosSession(aktor['u.cashier']!, siteId, companyId, 300_000, `ses-${Date.now()}`);
      await o2c.addPosOrder(aktor['u.cashier']!, sesi.id, {
        total: 500_000, tenderType: 'CASH', clientRef: `ord-${Date.now()}`,
        lines: [{ productCode: 'MENU-NASI', name: 'Nasi Goreng', qty: 10, unitPrice: 50_000 }],
      });

      // Kas dihitung kurang Rp 200.000 — jauh di atas batas T0 outlet (Rp 25.000).
      const hasil = await o2c.closePosSession(aktor['u.cashier']!, sesi.id, 600_000);
      assert.equal(hasil.variance, -200_000);

      const req = await prisma.approvalRequest.findFirstOrThrow({
        where: { docType: 'PosSession', docId: sesi.id },
      });
      assert.notEqual(req.band, 'T0', 'selisih Rp 200 rb lolos tanpa persetujuan');
    });
  });

  test('clientRef sama tidak menghasilkan dua transaksi', async () => {
    await tenant(async () => {
      const sesi = await o2c.openPosSession(aktor['u.cashier']!, siteId, companyId, 0, `ses-idem-${Date.now()}`);
      const ref = `ord-idem-${Date.now()}`;
      await o2c.addPosOrder(aktor['u.cashier']!, sesi.id, {
        total: 100_000, tenderType: 'CASH', clientRef: ref,
        lines: [{ productCode: 'X', name: 'X', qty: 1, unitPrice: 100_000 }],
      });
      await assert.rejects(
        () => o2c.addPosOrder(aktor['u.cashier']!, sesi.id, {
          total: 100_000, tenderType: 'CASH', clientRef: ref,
          lines: [{ productCode: 'X', name: 'X', qty: 1, unitPrice: 100_000 }],
        }),
        'unique index pada clientRef tidak menahan duplikat',
      );
    });
  });
});

// ─── 8. periode terkunci ──────────────────────────────────────────────────────

describe('Periode', () => {
  test('posting ke periode terkunci ditolak', async () => {
    await tenant(async () => {
      const now = new Date();
      const periode = await r2r.periodOf(companyId, now);
      await prisma.period.update({ where: { id: periode.id }, data: { status: 'LOCKED' } });

      const kas = await prisma.account.findFirstOrThrow({ where: { code: '1-1100' } });
      const beban = await prisma.account.findFirstOrThrow({ where: { code: '5-1000' } });

      await harusDitolak('PERIOD_LOCKED', () => r2r.createJournal(aktor['u.gl']!, {
        companyId, journalCode: 'JV', postingDate: now, source: 'MANUAL',
        lines: [
          { accountId: beban.id, debit: 10_000, credit: 0 },
          { accountId: kas.id, debit: 0, credit: 10_000 },
        ],
      }));

      await prisma.period.update({ where: { id: periode.id }, data: { status: 'OPEN' } });
    });
  });
});
