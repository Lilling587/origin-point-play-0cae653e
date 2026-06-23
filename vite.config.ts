// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      hmr: {
        // The preview is served over HTTPS with no explicit port. Without a
        // clientPort, Vite generates a websocket URL like
        // `wss://<preview-host>:/`, then falls back to `localhost:8080` from
        // the browser. That failed websocket path was what caused the delayed
        // reconnect/reload cycle after a dev-server restart.
        clientPort: 443,
      },
    },
    optimizeDeps: {
      // Disable late dependency discovery: after a cold dev-server restart Vite can
      // discover route-only dependencies several seconds after the page opens and
      // force a full browser reload. Keep the needed browser deps explicit instead.
      noDiscovery: true,
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "@tanstack/router-core",
        "@tanstack/router-core/ssr/client",
        "@tanstack/zod-adapter",
        "@radix-ui/react-accordion",
        "@radix-ui/react-alert-dialog",
        "@radix-ui/react-aspect-ratio",
        "@radix-ui/react-avatar",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-collapsible",
        "@radix-ui/react-context-menu",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-hover-card",
        "@radix-ui/react-label",
        "@radix-ui/react-menubar",
        "@radix-ui/react-navigation-menu",
        "@radix-ui/react-popover",
        "@radix-ui/react-progress",
        "@radix-ui/react-radio-group",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-select",
        "@radix-ui/react-separator",
        "@radix-ui/react-slider",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tabs",
        "@radix-ui/react-toggle",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-tooltip",
        "@supabase/supabase-js",
        "class-variance-authority",
        "clsx",
        "cmdk",
        "embla-carousel-react",
        "html-to-image",
        "input-otp",
        "lucide-react",
        "react-day-picker",
        "react-hook-form",
        "react-resizable-panels",
        "recharts",
        "seroval",
        "sonner",
        "tailwind-merge",
        "vaul",
        "zod",
      ],
    },
  },
});
