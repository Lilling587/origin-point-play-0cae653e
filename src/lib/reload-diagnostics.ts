declare global {
  interface Window {
    __reloadDiagnosticsInstalled?: boolean;
    __reloadDiagnostics?: ReloadDiagnosticEntry[];
  }
}

type ReloadDiagnosticEntry = {
  at: string;
  sinceLoadMs: number;
  type: string;
  detail?: unknown;
};

const STORAGE_KEY = "producerStats:reloadDiagnostics";
const MAX_ENTRIES = 120;

function nowMs() {
  return Math.round(performance.now());
}

function sanitizeUrl(value: string) {
  const looksUrlLike = /^[a-z][a-z\d+.-]*:\/\//i.test(value) || value.startsWith("/") || value.startsWith("?");
  if (!looksUrlLike) {
    return value.replace(/([?&][^=]*(?:token|secret|key|auth|session|code)[^=]*=)[^&]+/gi, "$1[redacted]");
  }
  try {
    const url = new URL(value, window.location.href);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|secret|key|auth|session|code/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return value.replace(/([?&][^=]*(?:token|secret|key|auth|session|code)[^=]*=)[^&]+/gi, "$1[redacted]");
  }
}

function compact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeUrl(value).slice(0, 500);
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.slice(0, 1200) };
  }
  if (value instanceof Event) {
    return { type: value.type };
  }
  if (depth >= 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => compact(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      if (/token|secret|key|auth|session|password/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = compact(item, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function readStoredEntries(): ReloadDiagnosticEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReloadDiagnosticEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStoredEntries(entries: ReloadDiagnosticEntry[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Ignore storage quota/privacy failures; console logs still work.
  }
}

function log(type: string, detail?: unknown) {
  const entry: ReloadDiagnosticEntry = {
    at: new Date().toISOString(),
    sinceLoadMs: nowMs(),
    type,
    detail: compact(detail),
  };
  window.__reloadDiagnostics = [...(window.__reloadDiagnostics ?? []), entry].slice(-MAX_ENTRIES);
  writeStoredEntries([...(readStoredEntries() ?? []), entry]);
  console.info("[reload-diagnostics]", entry);
}

function recentNetworkEntries() {
  return performance
    .getEntriesByType("resource")
    .slice(-25)
    .map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: sanitizeUrl(resource.name),
        initiatorType: resource.initiatorType,
        startTime: Math.round(resource.startTime),
        duration: Math.round(resource.duration),
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
      };
    });
}

function navigationSnapshot() {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return {
    href: sanitizeUrl(window.location.href),
    visibilityState: document.visibilityState,
    navType: nav?.type,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : undefined,
    loadEventMs: nav ? Math.round(nav.loadEventEnd) : undefined,
    resources: recentNetworkEntries(),
  };
}

function installNetworkLogging() {
  const originalFetch = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    log("fetch:start", { method, url });
    try {
      const response = await originalFetch(input, init);
      log("fetch:end", {
        method,
        url,
        status: response.status,
        ok: response.ok,
        durationMs: Math.round(performance.now() - started),
      });
      return response;
    } catch (error) {
      log("fetch:error", { method, url, durationMs: Math.round(performance.now() - started), error });
      throw error;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function open(method: string, url: string | URL) {
    (this as XMLHttpRequest & { __reloadDiagnostics?: { method: string; url: string; started: number } }).__reloadDiagnostics = {
      method,
      url: String(url),
      started: performance.now(),
    };
    return originalOpen.apply(this, arguments as unknown as Parameters<typeof originalOpen>);
  };
  XMLHttpRequest.prototype.send = function send() {
    const xhr = this as XMLHttpRequest & { __reloadDiagnostics?: { method: string; url: string; started: number } };
    const meta = xhr.__reloadDiagnostics;
    if (meta) {
      log("xhr:start", { method: meta.method, url: meta.url });
      const done = (event: Event) => {
        log("xhr:end", {
          event: event.type,
          method: meta.method,
          url: meta.url,
          status: xhr.status,
          durationMs: Math.round(performance.now() - meta.started),
        });
      };
      xhr.addEventListener("loadend", done, { once: true });
      xhr.addEventListener("error", done, { once: true });
      xhr.addEventListener("abort", done, { once: true });
    }
    return originalSend.apply(this, arguments as unknown as Parameters<typeof originalSend>);
  };
}

function installHmrLogging() {
  const hot = import.meta.hot;
  if (!hot) {
    log("hmr:unavailable");
    return;
  }
  for (const event of [
    "vite:beforeUpdate",
    "vite:afterUpdate",
    "vite:beforeFullReload",
    "vite:error",
    "vite:invalidate",
    "vite:ws:connect",
    "vite:ws:disconnect",
    "server-ssr-error",
    "server-fn-error",
  ]) {
    hot.on(event, (payload) => log(`hmr:${event}`, payload));
  }
}

function installResourceObserver() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        log("resource", {
          name: resource.name,
          initiatorType: resource.initiatorType,
          startTime: Math.round(resource.startTime),
          duration: Math.round(resource.duration),
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
        });
      }
    });
    observer.observe({ type: "resource", buffered: true });
  } catch (error) {
    log("resource-observer:error", { error });
  }
}

export function installReloadDiagnostics() {
  if (typeof window === "undefined" || window.__reloadDiagnosticsInstalled) return;
  window.__reloadDiagnosticsInstalled = true;

  const previous = readStoredEntries();
  if (previous.length) {
    console.info("[reload-diagnostics] previous-session", previous.slice(-40));
  }

  log("boot", navigationSnapshot());
  installNetworkLogging();
  installHmrLogging();
  installResourceObserver();

  window.addEventListener("beforeunload", () => log("page:beforeunload", navigationSnapshot()));
  window.addEventListener("pagehide", (event) => log("page:pagehide", { persisted: event.persisted, ...navigationSnapshot() }));
  window.addEventListener("pageshow", (event) => log("page:pageshow", { persisted: event.persisted, ...navigationSnapshot() }));
  document.addEventListener("visibilitychange", () => log("page:visibilitychange", { visibilityState: document.visibilityState }));
  window.addEventListener("error", (event) => log("window:error", { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error }));
  window.addEventListener("unhandledrejection", (event) => log("window:unhandledrejection", { reason: event.reason }));

  window.setTimeout(() => log("timer:12s-snapshot", navigationSnapshot()), 12_000);
  window.setTimeout(() => log("timer:15s-snapshot", navigationSnapshot()), 15_000);
}
