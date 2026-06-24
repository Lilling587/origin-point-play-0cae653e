/**
 * Översätter tekniska/engelska felmeddelanden till begriplig svenska
 * för slutanvändare. Originalfelet loggas alltid till console för debug.
 */
export function translateError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  const msg = raw.toLowerCase();

  if (!msg) return "Ett oväntat fel uppstod. Försök igen.";

  // Nätverk / anslutning
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("err_internet_disconnected") ||
    msg.includes("load failed")
  ) {
    return "Kunde inte nå servern. Kontrollera din internetanslutning och försök igen.";
  }

  // Timeout
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted")) {
    return "Begäran tog för lång tid. Försök igen om en stund.";
  }

  // 404 / not found
  if (msg.includes("404") || msg.includes("not found") || msg.includes("notfound")) {
    return "Hittade ingen matchdata för valt lag och säsong.";
  }

  // 401 / 403
  if (msg.includes("401") || msg.includes("unauthorized")) {
    return "Du behöver logga in för att se det här.";
  }
  if (msg.includes("403") || msg.includes("forbidden")) {
    return "Du har inte behörighet till den här åtgärden.";
  }

  // 429
  if (msg.includes("429") || msg.includes("too many requests") || msg.includes("rate limit")) {
    return "För många förfrågningar just nu. Vänta en stund och försök igen.";
  }

  // 5xx / generic server
  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("httperror") ||
    msg.includes("internal server")
  ) {
    return "Något gick fel på servern. Försök igen om en stund.";
  }

  // Parser-fel från Swehockey
  if (msg.includes("parse") || msg.includes("unexpected token")) {
    return "Kunde inte tolka svaret från Swehockey. Försök uppdatera.";
  }

  // Behåll redan svenska meddelanden
  if (/[åäö]/i.test(raw)) return raw;

  return "Ett oväntat fel uppstod. Försök igen.";
}
