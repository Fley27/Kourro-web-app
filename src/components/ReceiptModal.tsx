import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { palette, radius, shadow } from "../lib/theme";
import { buildReceiptHtml, copyLabel, receiptToText, type ReceiptData } from "../lib/receipts";
import { monoStyle } from "../lib/format";
import { Button, ModalHeader, Overlay } from "./ui";

function Paper({ r }: { r: ReceiptData }) {
  const text = receiptToText(r);
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: radius.md,
        border: `0.5px solid ${palette.hairline}`,
        boxShadow: shadow.card,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 18, paddingBottom: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: palette.ink }}>JESYON MAGAZEN</span>
          <span style={{ ...monoStyle, fontSize: 10, color: palette.muted2, fontWeight: 600 }}>{r.storeName}</span>
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ padding: "3px 9px", borderRadius: 20, background: "#E7F0FF", border: `1px solid #A7C8F5`, fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: "#1D4ED8" }}>
            {copyLabel(r.copyType)}
          </span>
          <span style={{ ...monoStyle, fontSize: 10.5, color: palette.muted2, fontWeight: 700 }}>N° {r.receiptNumber}</span>
        </div>
      </div>
      <pre
        style={{
          ...monoStyle,
          margin: 0,
          padding: "2px 18px 16px",
          fontSize: 11.5,
          lineHeight: 1.6,
          color: palette.ink,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {text}
      </pre>
    </div>
  );
}

export function ReceiptModal({
  receipts,
  onClose,
  title = "RESI ✓",
  width = 640,
  printLabel = "Imprime / Retrèt",
}: {
  receipts: { customer: ReceiptData; store: ReceiptData } | null;
  onClose: () => void;
  title?: string;
  width?: number;
  printLabel?: string;
}) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => setPrinting(false), 1200);
    return () => {
      window.removeEventListener("afterprint", done);
      window.clearTimeout(t);
    };
  }, [printing]);
  if (!receipts) return null;
  const { customer, store } = receipts;

  function doPrint() {
    setPrinting(true);
    window.setTimeout(() => {
      window.print();
    }, 80);
  }

  const printArea = printing
    ? createPortal(
        <>
          <style>
            {`@media print {
  body { background: #fff; }
  body * { visibility: hidden; }
  #jm-print-area, #jm-print-area * { visibility: visible; }
  #jm-print-area { position: absolute; left: 0; top: 0; width: 80mm; max-width: 100%; background: #fff; }
}`}
          </style>
          <div
            id="jm-print-area"
            style={{ position: "fixed", left: 0, top: 0, width: "80mm", maxWidth: "100%", background: "#fff" }}
          >
            <div
              dangerouslySetInnerHTML={{
                __html:
                  buildReceiptHtml(customer) +
                  '<div style="page-break-after: always"></div>' +
                  buildReceiptHtml(store),
              }}
            />
          </div>
        </>,
        document.body
      )
    : null;

  function finishPrint() {
    setPrinting(false);
  }

  return (
    <Overlay onClose={onClose} width={width}>
      <ModalHeader title={title} onClose={onClose} sub="De kopi — youn pou kliyan, youn pou magazen" />
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, maxHeight: "62vh", paddingRight: 4 }}>
        <Paper r={customer} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, borderTop: `1px dashed ${palette.muted3}` }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: palette.muted2 }}>KOUPE ISIT</span>
          <div style={{ flex: 1, borderTop: `1px dashed ${palette.muted3}` }} />
        </div>
        <Paper r={store} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 14, borderTop: `0.5px solid ${palette.hairline}` }}>
        <Button label={printLabel} icon="print" onClick={doPrint} style={{ flex: 1 }} />
        <Button label="Fèmen" variant="ghost" onClick={() => { finishPrint(); onClose(); }} style={{ flex: 1 }} />
      </div>
      {printArea}
    </Overlay>
  );
}