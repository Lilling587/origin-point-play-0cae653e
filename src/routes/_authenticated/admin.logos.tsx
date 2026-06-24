import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import {
  clearTeamLogoCache,
  ensureTeamLogo,
  listTeamLogoStatus,
  setTeamLogoOverride,
  type TeamLogoStatus,
} from "@/lib/team-logos.functions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TeamLogo } from "@/components/team-logo";

export const Route = createFileRoute("/_authenticated/admin/logos")({
  head: () => ({
    meta: [
      { title: "Logo admin · HockeyEttan Södra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LogoAdminPage,
});

const LS_KEY = "lovable.teamlogos.v1";

function LogoAdminPage() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(listTeamLogoStatus);
  const refetchOne = useServerFn(ensureTeamLogo);
  const saveOverride = useServerFn(setTeamLogoOverride);
  const clearOne = useServerFn(clearTeamLogoCache);

  const statusQuery = useQuery({
    queryKey: ["team-logos-admin"],
    queryFn: () => fetchStatus(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["team-logos-admin"] });
    queryClient.invalidateQueries({ queryKey: ["team-logos"] });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LS_KEY);
      } catch {
        /* ignore */
      }
    }
  };

  const refetchMutation = useMutation({
    mutationFn: (team: string) => refetchOne({ data: { team } }),
    onSuccess: (res) => {
      invalidate();
      toast.success(
        res.url ? `Hittade logga för ${res.team}` : `Ingen logga hittad för ${res.team}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMutation = useMutation({
    mutationFn: (team: string) => clearOne({ data: { team } }),
    onSuccess: () => {
      invalidate();
      toast.success("Cache rensad");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMutation = useMutation({
    mutationFn: (vars: { team: string; url: string }) =>
      saveOverride({ data: vars }),
    onSuccess: (_d, vars) => {
      invalidate();
      setDrafts((d) => ({ ...d, [vars.team]: "" }));
      toast.success(`Sparad override för ${vars.team}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const setDraft = (team: string, url: string) =>
    setDrafts((d) => ({ ...d, [team]: url }));

  const rows: TeamLogoStatus[] = statusQuery.data?.rows ?? [];
  const missing = rows.filter((r) => r.status !== "ok" || !r.logoUrl);
  const ok = rows.filter((r) => r.status === "ok" && r.logoUrl);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Logotyp-admin
            </h1>
            <p className="text-sm text-muted-foreground">
              Granska cache, trigga omhämtning och lägg in manuella overrides.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        {statusQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Laddar…</p>
        ) : (
          <>
            <Section
              title={`Saknar logga (${missing.length})`}
              rows={missing}
              drafts={drafts}
              setDraft={setDraft}
              onRefetch={(t) => refetchMutation.mutate(t)}
              onSave={(t, url) => saveMutation.mutate({ team: t, url })}
              onClear={(t) => clearMutation.mutate(t)}
              pendingTeam={
                refetchMutation.isPending
                  ? (refetchMutation.variables as string)
                  : null
              }
            />
            <Section
              title={`Cachelagda (${ok.length})`}
              rows={ok}
              drafts={drafts}
              setDraft={setDraft}
              onRefetch={(t) => refetchMutation.mutate(t)}
              onSave={(t, url) => saveMutation.mutate({ team: t, url })}
              onClear={(t) => clearMutation.mutate(t)}
              pendingTeam={
                refetchMutation.isPending
                  ? (refetchMutation.variables as string)
                  : null
              }
              muted
            />
          </>
        )}
      </main>
    </div>
  );
}

function Section({
  title,
  rows,
  drafts,
  setDraft,
  onRefetch,
  onSave,
  onClear,
  pendingTeam,
  muted,
}: {
  title: string;
  rows: TeamLogoStatus[];
  drafts: Record<string, string>;
  setDraft: (team: string, url: string) => void;
  onRefetch: (team: string) => void;
  onSave: (team: string, url: string) => void;
  onClear: (team: string) => void;
  pendingTeam: string | null;
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => {
          const draft = drafts[row.team] ?? "";
          return (
            <div
              key={row.team}
              className={`flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 ${
                muted ? "opacity-90" : ""
              }`}
            >
              <TeamLogo team={row.team} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {row.team}
                  </span>
                  <StatusBadge status={row.status} />
                </div>
                {row.logoUrl ? (
                  <a
                    href={row.logoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-muted-foreground hover:underline"
                  >
                    {row.logoUrl}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Ingen URL cachad
                  </span>
                )}
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <Input
                  placeholder="https://…/logo.png"
                  value={draft}
                  onChange={(e) => setDraft(row.team, e.target.value)}
                  className="w-full sm:w-72"
                />
                <Button
                  size="sm"
                  onClick={() => onSave(row.team, draft.trim())}
                  disabled={!draft.trim()}
                >
                  Spara
                </Button>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  title="Hämta om från Hockeyettan"
                  onClick={() => onRefetch(row.team)}
                  disabled={pendingTeam === row.team}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${
                      pendingTeam === row.team ? "animate-spin" : ""
                    }`}
                  />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  title="Rensa cache-raden"
                  onClick={() => onClear(row.team)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: TeamLogoStatus["status"] }) {
  if (status === "ok")
    return (
      <Badge variant="secondary" className="text-[10px]">
        cachad
      </Badge>
    );
  if (status === "missing")
    return (
      <Badge variant="destructive" className="text-[10px]">
        missing
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px]">
      ohämtad
    </Badge>
  );
}
