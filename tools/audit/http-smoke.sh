#!/usr/bin/env bash
# Asap HTTP terhadap server sungguhan. Bukan pengganti tes integrasi — ini
# memeriksa lapisan yang tes tidak sentuh: hook tenant, autentikasi bearer,
# penanganan galat, dan pembatasan laju.
#
#   PORT=3100 node --env-file=.env --import tsx src/server.ts &
#   bash tools/audit/http-smoke.sh
set -u
B="${BASE:-http://localhost:3100}"
T="-H content-type:application/json -H x-tenant:horison-emerald"
lulus=0; gagal=0

cek() { # nama, diharapkan, didapat
  if [ "$2" = "$3" ]; then printf "  ✔ %-46s %s\n" "$1" "$3"; lulus=$((lulus+1));
  else printf "  ✖ %-46s diharapkan %s, dapat %s\n" "$1" "$2" "$3"; gagal=$((gagal+1)); fi
}
kode() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "── tenant & autentikasi"
cek "health tanpa tenant"          200 "$(kode "$B/health")"
cek "tenant tidak dikenal"         404 "$(kode -H 'x-tenant: tidak-ada' "$B/approvals/pending")"
cek "tanpa header tenant"          400 "$(kode "$B/approvals/pending")"
cek "rute terlindung tanpa token"  401 "$(kode $T "$B/approvals/pending")"
cek "token palsu"                  401 "$(kode $T -H 'authorization: Bearer palsu' "$B/approvals/pending")"
cek "sandi salah"                  401 "$(kode $T -X POST "$B/auth/login" -d '{"subjectId":"u.owner","password":"salah-sekali"}')"
cek "subjek tidak ada"             401 "$(kode $T -X POST "$B/auth/login" -d '{"subjectId":"u.hantu","password":"salah-sekali"}')"
cek "badan permintaan cacat"       400 "$(kode $T -X POST "$B/auth/login" -d '{"subjectId":123}')"

TOK=$(curl -s $T -X POST "$B/auth/login" -d '{"subjectId":"u.owner","password":"ubah-password-ini-2026"}' \
  | node -pe 'try{JSON.parse(require("fs").readFileSync(0)).token}catch(e){""}')
cek "login sandi benar"            1   "$([ -n "$TOK" ] && echo 1 || echo 0)"
cek "rute terlindung dengan token" 200 "$(kode $T -H "authorization: Bearer $TOK" "$B/approvals/pending")"

echo "── otorisasi"
cek "pemilik ditolak sebelum dokumen dicari" 403 "$(kode $T -H "authorization: Bearer $TOK" -X POST "$B/r2r/journals/tidak-ada/post" -d '{}')"

echo "── pembatasan laju login (maks 10 / menit)"
for i in $(seq 1 11); do
  L=$(kode $T -X POST "$B/auth/login" -d '{"subjectId":"u.hantu","password":"x"}')
done
cek "percobaan ke-11 ditahan"      429 "$L"

echo
echo "  lulus=$lulus gagal=$gagal"
[ "$gagal" -eq 0 ]
