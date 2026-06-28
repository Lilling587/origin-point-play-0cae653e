// Service-worker registration wrapper with Lovable-preview guards.
// Registration is REFUSED in any of these contexts:
//   - dev (import.meta.env.PROD === false)
//   - inside an iframe (Lovable preview embeds iframes)
//   - hostnames id-preview--*, preview--*, lovableproject.com,
//     lovableproject-dev.com, beta.lovable.dev
//   - URL contains ?sw=off
// In all refused contexts any matching /sw.js registration is unregistered.

const SW_PATH = "/sw.js";

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  try {
    if (window.top !== window.self) return true;
  } catch {
    return true; // cross-origin frame access throws → treat as refused
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get("sw") === "off") return true;
  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com")
  )
    return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterMatching() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const script = reg.active?.scriptURL ?? reg.installing?.scriptURL ?? "";
      if (script.endsWith(SW_PATH)) await reg.unregister();
    }
  } catch (e) {
    console.warn("[sw] unregister failed:", (e as Error).message);
  }
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (isRefusedContext()) {
    void unregisterMatching();
    return;
  }
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_PATH, { scope: "/" })
      .catch((err) => console.warn("[sw] register failed:", err));
  });
}
