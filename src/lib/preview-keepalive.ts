declare global {
  interface Window {
    __previewKeepaliveInstalled?: boolean;
  }
}

function isPreviewEnvironment() {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    import.meta.env.DEV === true ||
    hostname === "localhost" ||
    hostname.endsWith(".lovable.app") ||
    hostname.includes("lovable-")
  );
}

export function installPreviewKeepalive() {
  if (typeof window === "undefined" || window.__previewKeepaliveInstalled) return;
  if (!isPreviewEnvironment()) return;

  window.__previewKeepaliveInstalled = true;

  const INTERVAL_MS = 10_000;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastBeat = 0;

  async function beat() {
    if (document.visibilityState !== "visible") return;
    if (performance.now() - lastBeat < INTERVAL_MS - 500) return;

    lastBeat = performance.now();
    try {
      const url = new URL("/favicon.ico", window.location.href);
      url.searchParams.set("_keepalive", Date.now().toString());
      await fetch(url, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        keepalive: true,
      });
    } catch {
      // Swallow: the heartbeat is best-effort; we only want to keep the
      // webview's network stack active so it doesn't suspend the HMR socket.
    }
  }

  function schedule() {
    if (timeoutId) clearTimeout(timeoutId);
    if (document.visibilityState === "visible") {
      timeoutId = setTimeout(() => {
        beat().finally(schedule);
      }, INTERVAL_MS);
    }
  }

  document.addEventListener("visibilitychange", schedule);
  schedule();

  // Beat immediately on first install so the first inactivity window is covered.
  beat().finally(schedule);
}
