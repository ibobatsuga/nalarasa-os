import { ORDER_TYPE_LABEL, rupiah, store, type LocalOrder } from '../lib/store';

const TENDER: Record<string, string> = {
  CASH: 'Tunai', QRIS: 'QRIS', CARD: 'Kartu', EWALLET: 'E-Wallet',
};

/**
 * Browser-print fallback receipt. Hidden on screen, sized for 58 mm paper.
 * The print stylesheet lives in index.css so only this block reaches the paper.
 */
export function Receipt({ order, cashier }: { order: LocalOrder; cashier: string }) {
  const isVoid = order.total < 0;

  return (
    <div id="receipt" className="hidden print:block font-mono text-[11px] leading-[1.35] text-black w-[58mm] p-1">
      <div className="text-center">
        <div className="text-[15px] font-bold">{store.siteCode()}</div>
        <div>Nalarasa OS</div>
      </div>

      <Rule />
      <div>{new Date(order.at).toLocaleString('id-ID')}</div>
      <div>Kasir : {cashier}</div>
      <div>Struk : {order.clientRef.slice(-10)}</div>
      <div>Tipe  : {ORDER_TYPE_LABEL[order.orderType]}</div>
      {order.tableNo && <div>Meja  : {order.tableNo}</div>}
      {isVoid && <div className="font-bold">** PEMBATALAN **</div>}
      <Rule />

      {order.lines.map((l, i) => (
        <div key={i}>
          <div>{l.name}</div>
          <Pair
            left={`  ${l.qty} x ${new Intl.NumberFormat('id-ID').format(l.unitPrice)}`}
            right={new Intl.NumberFormat('id-ID').format(l.qty * l.unitPrice)}
          />
          {l.note && <div>  * {l.note}</div>}
        </div>
      ))}

      <Rule />
      <Pair left="TOTAL" right={rupiah(order.total)} bold />
      <Pair left={TENDER[order.tenderType] ?? order.tenderType} right={rupiah(order.paid)} />
      {order.tenderType === 'CASH' && <Pair left="Kembali" right={rupiah(order.change)} />}
      {order.gatewayRef && <div>Ref: {order.gatewayRef}</div>}
      {order.voidOfRef && <div>Batal dari: {order.voidOfRef.slice(-10)}</div>}
      {order.voidReason && <div>Alasan: {order.voidReason}</div>}
      <Rule />

      <div className="text-center mt-1">
        <div>Terima kasih</div>
        <div>Simpan struk sebagai bukti</div>
      </div>
    </div>
  );
}

const Rule = () => <div>{'-'.repeat(32)}</div>;

const Pair = ({ left, right, bold }: { left: string; right: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}>
    <span>{left}</span><span>{right}</span>
  </div>
);
