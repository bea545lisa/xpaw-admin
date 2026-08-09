export const DEFAULT_SKU_FORMAT = {
  enabled: true,   // false = keine Prüfung, alle SKUs erlaubt
  separator: "-",
  customRegex: "",
  example: "12345-bl-m",
};

/**
 * Baut aus gespeicherten Format-Einstellungen eine Validator-Funktion.
 *
 * @param {object} fmt            - Gespeichertes SKU-Format
 * @param {number} expectedParts  - Erwartete Teilanzahl (1 + Anzahl Optionen der Variante).
 *                                  Wird ignoriert wenn customRegex gesetzt ist.
 *
 * Gibt null zurück wenn die SKU gültig ist, sonst eine Fehlermeldung.
 */
export function buildSkuValidator(fmt, expectedParts) {
  if (!fmt || fmt.enabled === false) return () => null;
  const { separator, customRegex, example } = fmt;

  const sep = separator || "-";
  const hint = example || `präfix${sep}option1`;

  // Optionaler Regex nur für den Präfix (erstes Segment)
  let prefixRe = null;
  if (customRegex?.trim()) {
    try { prefixRe = new RegExp(customRegex.trim()); } catch { /* ungültig → ignorieren */ }
  }

  return (sku) => {
    if (!sku) return null;
    const parts = sku.trim().split(sep);

    if (parts.some((p) => p === "")) {
      return `SKU darf nicht mit "${sep}" beginnen/enden oder doppeltes "${sep}" enthalten`;
    }

    // Präfix-Format prüfen
    if (prefixRe && !prefixRe.test(parts[0])) {
      return `Präfix „${parts[0]}" entspricht nicht dem erlaubten Format (${customRegex})`;
    }

    // Teilanzahl prüfen
    if (expectedParts != null && parts.length !== expectedParts) {
      const word = expectedParts === 1 ? "Teil" : "Teile";
      return `${expectedParts} ${word} erwartet (z. B. "${hint}"), gefunden: ${parts.length}`;
    }

    return null;
  };
}
