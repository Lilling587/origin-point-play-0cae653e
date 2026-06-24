import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Check, X } from "lucide-react";
import {
  confirmSeasonDetection,
  dismissSeasonDetection,
} from "@/lib/stats.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Pending = {
  id: string;
  label: string;
  competitionId: string;
  detectedAt: string;
};

export function PendingSeasonsBanner({
  pending,
  onChanged,
}: {
  pending: Pending[];
  onChanged: () => void;
}) {
  if (pending.length === 0) return null;
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4 text-primary" />
          Ny{pending.length > 1 ? "a" : ""} säsong
          {pending.length > 1 ? "er" : ""} upptäckt på swehockey.se
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Granska och bekräfta innan appen börjar hämta data. Du kan justera
          tävlings-ID om det upptäckta är fel.
        </p>
        {pending.map((p) => (
          <PendingSeasonRow key={p.id} item={p} onChanged={onChanged} />
        ))}
      </CardContent>
    </Card>
  );
}

function PendingSeasonRow({
  item,
  onChanged,
}: {
  item: Pending;
  onChanged: () => void;
}) {
  const confirmFn = useServerFn(confirmSeasonDetection);
  const dismissFn = useServerFn(dismissSeasonDetection);
  const [compId, setCompId] = useState(item.competitionId);
  const [busy, setBusy] = useState<null | "confirm" | "dismiss">(null);
  const [err, setErr] = useState<string | null>(null);

  const confirm = async () => {
    setBusy("confirm");
    setErr(null);
    try {
      await confirmFn({ data: { id: item.id, competitionId: compId } });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const dismiss = async () => {
    setBusy("dismiss");
    setErr(null);
    try {
      await dismissFn({ data: { id: item.id } });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Säsong
          </div>
          <div className="font-mono text-base">{item.label}</div>
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tävlings-ID
          </label>
          <Input
            value={compId}
            onChange={(e) => setCompId(e.target.value)}
            inputMode="numeric"
            className="font-mono"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={confirm} disabled={busy !== null}>
            <Check className="mr-1 h-4 w-4" />
            {busy === "confirm" ? "Lägger till…" : "Lägg till"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={dismiss}
            disabled={busy !== null}
          >
            <X className="mr-1 h-4 w-4" />
            Avfärda
          </Button>
        </div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Upptäckt {new Date(item.detectedAt).toLocaleString("sv-SE")}
      </div>
      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
    </div>
  );
}
