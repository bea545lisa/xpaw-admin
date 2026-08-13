// Nur-Lese-Modus: Nur die E-Mail-Adressen in EDITOR_EMAILS (kommagetrennt, siehe .env)
// dürfen Daten ändern. Alle anderen eingeladenen Mitarbeiter sehen die App normal,
// können aber nichts speichern/löschen — Prüfung passiert serverseitig in jeder Action.
function getEditorEmails() {
  return (process.env.EDITOR_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getSessionEmail(session) {
  return session?.onlineAccessInfo?.associated_user?.email?.toLowerCase() ?? null;
}

export function isEditorSession(session) {
  const editorEmails = getEditorEmails();
  // Keine Liste konfiguriert -> alle dürfen bearbeiten (Fallback, damit die App
  // ohne EDITOR_EMAILS-Konfiguration nicht versehentlich für alle gesperrt ist).
  if (editorEmails.length === 0) return true;
  const email = getSessionEmail(session);
  return !!email && editorEmails.includes(email);
}

// In jeder Action direkt nach authenticate.admin(request) aufrufen:
//   const denial = readOnlyDenial(session);
//   if (denial) return denial;
// Gibt ein normales Objekt zurück (kein throw), damit React Router es einfach als
// fetcher.data durchreicht statt eine Fehlerseite/ErrorBoundary auszulösen.
export function readOnlyDenial(session) {
  if (isEditorSession(session)) return null;
  return {
    ok: false,
    error: "readOnly",
    message: "Nur-Lese-Zugriff: Änderungen sind für dieses Konto deaktiviert.",
  };
}
