// Redemption entry: visible when pickup is enabled, for every seller role.
import React, { useState } from "react";
import { palette, radius } from "../lib/theme";
import { Button, Card } from "../components/ui";
import { usePickupEnabled } from "./flag";
import { RedeemPickup } from "./PickupSheets";

export function PickupRedeemEntry({ storeId, cashierId, storeName, cashierName }: {
  storeId: string;
  cashierId?: string | null;
  storeName?: string | null;
  cashierName?: string | null;
}) {
  const enabled = usePickupEnabled(storeId);
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <Card style={{ marginTop: 12, padding: 14, background: palette.successBg, borderColor: palette.successBd }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: palette.success }}>Rekipere machandiz</div>
      <div style={{ marginTop: 10 }}>
        <Button label="Ouvri rekipere" onClick={() => setOpen(true)} />
      </div>
      {open ? <RedeemPickup storeId={storeId} cashierId={cashierId ?? null} storeName={storeName ?? null} cashierName={cashierName ?? null} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

export const __redeemStyles = { palette, radius };
