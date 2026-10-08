// PICKUP: toggle card, visible to every seller role. Delete with folder.
import React, { useEffect, useState } from "react";
import { palette, radius } from "../lib/theme";
import { Button, Card } from "../components/ui";
import { getPickupEnabled, setPickupEnabled } from "./flag";

export function PickupToggleCard({ storeId, role }: { storeId: string; role?: string | null }) {
  void role; // every seller role has full access
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getPickupEnabled(storeId).then(setEnabled).catch(() => {}).finally(() => setLoading(false));
  }, [storeId]);
  return (
    <Card style={{ marginTop: 12, padding: 14, background: palette.warningBg, borderColor: palette.warningBd }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: palette.warning }}>
        Partial Pickup{loading ? "…" : enabled ? " • ON" : " • OFF"}
      </div>
      <div style={{ fontSize: 11, color: palette.muted2, marginTop: 4 }}>
        Disponib pou tout vandè sou aparèy sa a.
      </div>
      <div style={{ marginTop: 10 }}>
        <Button
          label={enabled ? "Etenn" : "Limon"}
          variant={enabled ? "soft" : "gold"}
          onClick={async () => {
            const next = !enabled;
            await setPickupEnabled(storeId, next);
            setEnabled(next);
          }}
        />
      </div>
    </Card>
  );
}

export function pickupToggleSection(storeId: string, role?: string | null) {
  void storeId; void role;
  return null;
}

export const __stagingStyles = { palette, radius };
