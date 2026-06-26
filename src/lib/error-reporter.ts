// Client-side helper that ships errors + context to the error_log table via
// the public logError server function. Fire-and-forget; never throws.

import { logError } from "./error-log.functions";

export type ErrorContext = Record<string, unknown>;

function normalizeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message || err.name || "Unknown error", stack: err.stack };
  }
  if (typeof err === "string") return { message: err };
  try {
    return { message: JSON.stringify(err).slice(0, 4000) };
  } catch {
    return { message: String(err) };
  }
}

export function reportError(
  source: string,
  err: unknown,
  context?: ErrorContext,
  level: "error" | "warn" | "info" = "error",
): void {
  const { message, stack } = normalizeError(err);
  const route =
    typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined;
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : undefined;

  // Fire-and-forget. Swallow rejection so the logger never breaks UX.
  void (async () => {
    try {
      await logError({
        data: {
          source,
          message,
          level,
          stack,
          context,
          route,
          userAgent,
        },
      });
    } catch (logErr) {
      console.error("[reportError] failed to log:", logErr);
    }
  })();
}
