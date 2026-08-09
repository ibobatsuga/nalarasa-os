#!/usr/bin/env bash
# Asap domain manajemen ruang terhadap server sungguhan.
#   PORT=3000 node --env-file=.env --import tsx src/server.ts &
#   bash tools/audit/manage-smoke.sh
set -u
B="${BASE:-http://localhost:3000}"
CT='content-type: application/json'
TN='x-tenant: horison-emerald'
lulus=0; gagal=0

cek() {
  if [ "$2" = "$3" ]; then printf "  ✔ %-48s %s\n" "$1" "$3"; lulus=$((lulus+1));
  else printf "  ✖ %-48s diharapkan %s, dapat %s\n" "$1" "$2" "$3"; gagal=$((gagal+1)); fi
}

masuk() { # subjectId -> token
  curl -s -H "$CT" -H "$TN" -X POST "$B/auth/login" \
    -d "{\"subjectId\":\"$1\",\"password\":\"ubah-password-ini-2026\"}" \
    | node -pe 'try{JSON.parse(require("fs").readFileSync(0)).token}catch(e){""}'
}
get()  { curl -s -H "$CT" -H "$TN" -H "authorization: Bearer $1" "$B$2"; }
post() { curl -s -H "$CT" -H "$TN" -H "authorization: Bearer $1" -X POST "$B$2" -d "$3"; }
kode() { curl -s -o /dev/null -w '%{http_code}' -H "$CT" -H "$TN" -H "authorization: Bearer $1" -X POST "$B$2" -d "$3"; }
bidang() { node -pe "try{const j=JSON.parse(require('fs').readFileSync(0));console.log??0;$1}catch(e){''}"; }

KASIR=$(masuk u.cashier)
GL=$(masuk u.gl)
# Menu engineering membuka HPP per menu — hak manajer layanan, bukan kasir.
SVC=$(masuk u.svcmgr)
# Login dibatasi 10/menit per IP. Menjalankan skrip ini tepat setelah
# http-smoke.sh akan menabrak batas itu, dan SETIAP pemeriksaan berikutnya
# gagal 401 — terbaca seolah domainnya rusak padahal yang habis hanya kuota.
if [ -z "$KASIR" ] || [ -z "$GL" ] || [ -z "$SVC" ]; then
  echo "  ✖ login gagal — kemungkinan besar batas laju login. Tunggu 60 detik, ulangi."
  exit 1
fi
cek "login kasir"                          1 "$([ -n "$KASIR" ] && echo 1 || echo 0)"

echo "── baca"
cek "jumlah meja ter-seed"                12 "$(get "$KASIR" '/manage/tables?siteCode=RESTO-01' | bidang 'j.length')"
# Skrip ini menambah reservasi tiap kali dijalankan; yang diuji minimalnya.
cek "reservasi seed terbaca"               1 "$(get "$KASIR" '/manage/reservations?siteCode=RESTO-01' | bidang 'j.length>=4?1:0')"
cek "acara seed terbaca"                   1 "$(get "$KASIR" '/manage/events?siteCode=RESTO-01' | bidang 'j.length>=1?1:0')"

echo "── otorisasi"
cek "akuntan tidak boleh ubah meja"      403 "$(kode "$GL" '/manage/tables/T01/status' '{"status":"TERISI"}')"

echo "── aturan bisnis"
cek "meja 2 kursi menolak 8 orang"       409 "$(kode "$KASIR" '/manage/reservations' \
  '{"siteCode":"RESTO-01","guestName":"Uji Kapasitas","phone":"081100000","bookedFor":"2026-08-10T12:00:00Z","pax":8,"tableCode":"T01"}')"
cek "meja tidak dikenal ditolak"         404 "$(kode "$KASIR" '/manage/reservations' \
  '{"siteCode":"RESTO-01","guestName":"Uji Meja","phone":"081100000","bookedFor":"2026-08-10T12:00:00Z","pax":2,"tableCode":"T99"}')"
# Acara Akustik ter-seed memakai Rooftop 20:00–22:30 hari ini.
HARI=$(date -u +%Y-%m-%d)
BENTROK="{\"siteCode\":\"RESTO-01\",\"name\":\"Bentrok\",\"startsAt\":\"${HARI}T20:30:00Z\",\"endsAt\":\"${HARI}T21:00:00Z\",\"area\":\"Rooftop\",\"pax\":10,\"kind\":\"MUSIK\",\"owner\":\"Uji\"}"
cek "kasir tidak boleh membuat acara"    403 "$(kode "$KASIR" '/manage/events' "$BENTROK")"
cek "area bentrok pada jam sama"         409 "$(kode "$SVC" '/manage/events' "$BENTROK")"

ID=$(post "$KASIR" '/manage/reservations' \
  '{"siteCode":"RESTO-01","guestName":"Uji Alur","phone":"081999000111","bookedFor":"2026-08-10T19:00:00Z","pax":2,"tableCode":"T01","source":"WHATSAPP"}' \
  | bidang 'j.id')
cek "reservasi baru dibuat"                1 "$([ -n "$ID" ] && echo 1 || echo 0)"
cek "MENUNGGU tidak bisa langsung DATANG" 409 "$(kode "$KASIR" "/manage/reservations/$ID/status" '{"status":"DATANG"}')"
cek "MENUNGGU → DIKONFIRMASI"             200 "$(kode "$KASIR" "/manage/reservations/$ID/status" '{"status":"DIKONFIRMASI"}')"
cek "DIKONFIRMASI → DATANG"               200 "$(kode "$KASIR" "/manage/reservations/$ID/status" '{"status":"DATANG"}')"
cek "DATANG bersifat final"               409 "$(kode "$KASIR" "/manage/reservations/$ID/status" '{"status":"BATAL"}')"
cek "meja ikut jadi TERISI"           TERISI "$(get "$KASIR" '/manage/tables?siteCode=RESTO-01' | bidang 'j.find(t=>t.kode==="T01").status')"
cek "status meja tak dikenal ditolak"     400 "$(kode "$KASIR" '/manage/tables/T02/status' '{"status":"MELAYANG"}')"

echo "── menu engineering dari penjualan nyata"
cek "kasir tidak boleh lihat struktur biaya" 403 "$(curl -s -o /dev/null -w '%{http_code}' -H "$CT" -H "$TN" \
  -H "authorization: Bearer $KASIR" "$B/manage/menu-performance?siteCode=RESTO-01")"
cek "manajer layanan boleh"                 1 "$(get "$SVC" '/manage/menu-performance?siteCode=RESTO-01&hari=30' \
  | node -pe 'try{Array.isArray(JSON.parse(require("fs").readFileSync(0)))?1:0}catch(e){0}')"

echo
echo "  lulus=$lulus gagal=$gagal"
[ "$gagal" -eq 0 ]
