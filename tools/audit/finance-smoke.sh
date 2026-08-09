#!/usr/bin/env bash
# Asap domain keuangan terhadap server sungguhan.
#   PORT=3200 node --env-file=.env --import tsx src/server.ts &
#   BASE=http://localhost:3200 bash tools/audit/finance-smoke.sh
set -u
B="${BASE:-http://localhost:3200}"
CT='content-type: application/json'
TN='x-tenant: horison-emerald'
lulus=0; gagal=0

cek() {
  if [ "$2" = "$3" ]; then printf "  ✔ %-50s %s\n" "$1" "$3"; lulus=$((lulus+1));
  else printf "  ✖ %-50s diharapkan %s, dapat %s\n" "$1" "$2" "$3"; gagal=$((gagal+1)); fi
}
masuk() {
  curl -s -H "$CT" -H "$TN" -X POST "$B/auth/login" \
    -d "{\"subjectId\":\"$1\",\"password\":\"ubah-password-ini-2026\"}" \
    | node -pe 'try{JSON.parse(require("fs").readFileSync(0)).token}catch(e){""}'
}
get()  { curl -s -H "$CT" -H "$TN" -H "authorization: Bearer $1" "$B$2"; }
kode() { curl -s -o /dev/null -w '%{http_code}' -H "$CT" -H "$TN" -H "authorization: Bearer $1" "$B$2"; }
bidang() { node -e "try{const j=JSON.parse(require('fs').readFileSync(0));$1}catch(e){process.stdout.write('')}"; }

CTRL=$(masuk u.controller)
KASIR=$(masuk u.cashier)
# Login dibatasi 10/menit per IP; jalan berturut dengan skrip asap lain menabraknya.
if [ -z "$CTRL" ] || [ -z "$KASIR" ]; then
  echo "  ✖ login gagal — kemungkinan batas laju. Tunggu 60 detik, ulangi."
  exit 1
fi

echo "── akses"
cek "controller boleh baca buku besar"           200 "$(kode "$CTRL" '/finance/ledger')"
cek "kasir tidak boleh baca buku besar"          403 "$(kode "$KASIR" '/finance/ledger')"
cek "kasir tidak boleh baca laba rugi"           403 "$(kode "$KASIR" '/finance/income-statement')"
cek "tanpa token ditolak"                        401 "$(curl -s -o /dev/null -w '%{http_code}' -H "$CT" -H "$TN" "$B/finance/ledger")"

echo "── konsistensi angka"
# Laba rugi dan buku besar HARUS berasal dari agregasi yang sama. Kalau keduanya
# berbeda, ada dua laporan resmi yang saling bertentangan — kegagalan diam.
LR=$(get "$CTRL" '/finance/income-statement' | bidang 'process.stdout.write(String(j.laba))')
BB=$(get "$CTRL" '/finance/ledger' | bidang '
  const p = j.filter(b=>b.jenis==="PENDAPATAN").reduce((s,b)=>s+b.saldo,0);
  const e = j.filter(b=>b.jenis==="BEBAN").reduce((s,b)=>s+b.saldo,0);
  process.stdout.write(String(Math.round((p-e)*100)/100))')
cek "laba rugi = buku besar"                     "$LR" "$BB"

RING=$(get "$CTRL" '/finance/summary' | bidang 'process.stdout.write(String(j.labaRugi.laba))')
cek "ringkasan = laba rugi"                      "$LR" "$RING"

KAS=$(get "$CTRL" '/finance/cash-position' | bidang 'process.stdout.write(String(j.total))')
KAS2=$(get "$CTRL" '/finance/summary' | bidang 'process.stdout.write(String(j.kas))')
cek "posisi kas = ringkasan"                     "$KAS" "$KAS2"

echo "── bentuk keluaran"
cek "status memakai kosakata Indonesia"            1 "$(get "$CTRL" '/finance/transactions' \
  | bidang 'process.stdout.write(String(j.every(t=>["DRAFT","DIAJUKAN","DISETUJUI","DIBUKUKAN","DITOLAK"].includes(t.status))?1:0))')"
cek "tren mengembalikan 7 bulan"                   7 "$(get "$CTRL" '/finance/trend?bulan=7' | bidang 'process.stdout.write(String(j.length))')"
cek "komposisi berjumlah 100%"                     1 "$(get "$CTRL" '/finance/sales-mix' \
  | bidang 'const t=j.reduce((s,x)=>s+x.value,0); process.stdout.write(String(j.length===0||Math.abs(t-100)<0.5?1:0))')"

echo "── penjualan kasir masuk buku besar"
cek "ada jurnal bersumber POS"                     1 "$(get "$CTRL" '/finance/transactions' \
  | bidang 'process.stdout.write(String(j.some(t=>t.sumber==="POS")?1:0))')"
# Margin kartu KPI dan margin grafik laba rugi harus berasal dari sumber yang
# sama; dua angka margin berbeda di satu layar adalah kegagalan diam.
MARGIN=$(get "$CTRL" '/finance/income-statement' | bidang 'process.stdout.write(String(Math.round(j.margin*1000)))')
TREN=$(get "$CTRL" '/finance/trend?bulan=1' | bidang 'process.stdout.write(String(Math.round(j[0].b*10)))')
cek "margin laba rugi = margin tren bulan ini"  "$MARGIN" "$TREN"

echo
echo "  lulus=$lulus gagal=$gagal"
[ "$gagal" -eq 0 ]
