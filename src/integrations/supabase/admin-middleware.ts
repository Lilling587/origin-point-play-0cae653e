import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

/**
 * Server-function middleware that requires the caller to be signed in AND
 * have the `admin` role in `public.user_roles`. Use on every admin-only
 * server function so the security boundary lives on the server, not the UI.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(`Role check failed: ${error.message}`);
    if (!data) throw new Error("Forbidden: admin role required");
    return next();
  });
