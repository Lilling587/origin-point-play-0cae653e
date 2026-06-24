import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · HockeyEttan Södra briefing" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.user) navigate({ to: "/admin/logos", replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/admin/logos" },
        });
        if (error) throw error;
        toast.success("Account created");
        navigate({ to: "/admin/logos", replace: true });
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        toast.success("Check your inbox for a reset link");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate({ to: "/admin/logos", replace: true });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      onClick={() => setMode("forgot")}
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Sign up"
                    : "Send reset link"}
            </Button>
            {mode === "forgot" ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline w-full"
                onClick={() => setMode("signin")}
              >
                ← Back to sign in
              </button>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline w-full"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              >
                {mode === "signin"
                  ? "No account? Create one"
                  : "Have an account? Sign in"}
              </button>
            )}
            <div className="text-center">
              <Link to="/" className="text-xs text-muted-foreground hover:underline">
                ← Back to briefing
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
