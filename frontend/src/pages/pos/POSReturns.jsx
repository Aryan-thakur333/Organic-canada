import { useState } from "react";
import toast from "react-hot-toast";
import POSShell from "../../components/pos/POSShell";
import POSReceipt from "../../components/pos/POSReceipt";
import { posApi } from "../../services/posApi";

export default function POSReturns() {
  const [orderId, setOrderId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState("CASH");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const normalizedOrderId = orderId.trim();
  const normalizedItemId = itemId.trim();
  const normalizedQuantity = Number(quantity);
  const requestReady = Boolean(normalizedOrderId && normalizedItemId && Number.isInteger(normalizedQuantity) && normalizedQuantity > 0);
  const items = [{ item_id: normalizedItemId, quantity: normalizedQuantity }];

  const clearPreview = () => {
    setPreview(null);
    setResult(null);
  };

  const runPreview = async () => {
    if (!requestReady) return;
    setPreview(null);
    try {
      setPreview((await posApi.previewReturn(normalizedOrderId, items)).preview);
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Unable to preview this return");
    }
  };

  const submit = async () => {
    if (!requestReady || !preview) return;
    try {
      const data = await posApi.createReturn(normalizedOrderId, {
        items,
        refund_method: method,
        condition: "SELLABLE",
        reason: "POS operator return",
      });
      setResult(data);
      toast.success("Return completed");
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Unable to complete this return");
    }
  };

  return (
    <POSShell>
      <div className="mx-auto max-w-2xl p-4 lg:p-6">
        <h1 className="text-2xl font-black">Return and refund</h1>
        <p className="mt-1 text-sm text-zinc-500">Manager approval is enforced by the backend. Refund method must match the original payment.</p>
        <div className="mt-5 grid gap-3 rounded border bg-white p-5">
          <input aria-label="Native order ID" value={orderId} onChange={(event) => { setOrderId(event.target.value); clearPreview(); }} placeholder="Native order ID" className="h-11 rounded border px-3" />
          <input aria-label="Order line item ID" value={itemId} onChange={(event) => { setItemId(event.target.value); clearPreview(); }} placeholder="Order line item ID" className="h-11 rounded border px-3" />
          <input aria-label="Return quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => { setQuantity(event.target.value); clearPreview(); }} className="h-11 rounded border px-3" />
          <select aria-label="Refund method" value={method} onChange={(event) => { setMethod(event.target.value); clearPreview(); }} className="h-11 rounded border px-3">
            <option value="CASH">Cash</option>
            <option value="CARD_MANUAL">Manual card</option>
          </select>
          <button type="button" disabled={!requestReady} onClick={runPreview} className="h-11 rounded border font-black disabled:opacity-40">Preview refund</button>
          {preview ? <p className="rounded bg-zinc-100 p-3 font-bold">Refund: {preview.refund_amount_minor} minor units</p> : null}
          <button type="button" disabled={!requestReady || !preview} onClick={submit} className="h-12 rounded bg-zinc-950 font-black text-white disabled:opacity-40">Approve and complete return</button>
        </div>
      </div>
      <POSReceipt receipt={result?.receipt} transaction={result?.transaction} onClose={() => setResult(null)} onNewSale={() => setResult(null)} />
    </POSShell>
  );
}
