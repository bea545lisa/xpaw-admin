// ── Feste Mapping-Tabelle ─────────────────────────────────────────────────────
// Farben (DE + EN), Größen, Materialien, Geschlecht

const SKU_MAP = {
  // Farben DE
  schwarz: "sw", weiss: "ws", weiß: "ws", grau: "gr", silber: "si",
  rot: "ro", dunkelrot: "dro", bordeaux: "brd",
  blau: "bl", dunkelblau: "dbl", hellblau: "hbl", navy: "nv",
  gruen: "gn", grün: "gn", dunkelgruen: "dgn", dunkelgrün: "dgn", hellgruen: "hgn", hellgrün: "hgn", olive: "ol",
  gelb: "ge", orange: "or", pink: "pk", lila: "li", violett: "vi", lila: "li",
  braun: "br", beige: "bg", creme: "cr", sand: "sd",
  gold: "go", kupfer: "ku", bronze: "bz",
  bunt: "bn", transparent: "tr", natur: "nt",

  // Farben EN
  black: "sw", white: "ws", grey: "gr", gray: "gr", silver: "si",
  red: "ro", darkred: "dro",
  blue: "bl", darkblue: "dbl", lightblue: "hbl",
  green: "gn", darkgreen: "dgn", lightgreen: "hgn",
  yellow: "ge", orange: "or", pink: "pk", purple: "li", violet: "vi",
  brown: "br", beige: "bg", cream: "cr",
  gold: "go", copper: "ku",
  multicolor: "bn", natural: "nt",

  // Konfektionsgrößen
  "x-small": "xs", "extra small": "xs", xsmall: "xs",
  small: "s",
  medium: "m",
  large: "l",
  "x-large": "xl", "extra large": "xl", xlarge: "xl",
  "xx-large": "xxl", "2x-large": "xxl", xxlarge: "xxl",
  "xxx-large": "xxxl", "3x-large": "xxxl",
  "one size": "os", "einheitsgröße": "os", einheitsgroesse: "os",

  // Tiergrößen
  "x-klein": "xs", "extra klein": "xs",
  klein: "s",
  mittel: "m",
  groß: "l", gross: "l",
  "x-groß": "xl", "x-gross": "xl",

  // Materialien
  baumwolle: "bw", cotton: "ct",
  leder: "le", leather: "le",
  kunstleder: "kl", "faux leather": "fl",
  nylon: "ny", polyester: "po", fleece: "fl",
  wolle: "wo", wool: "wo",
  metall: "me", metal: "me",
  kunststoff: "ks", plastic: "pl",
  holz: "hz", wood: "wd",
  gummi: "gu", rubber: "rb",

  // Geschlecht
  herren: "he", männer: "ma", maenner: "ma", men: "mn", male: "ml",
  damen: "da", frauen: "fr", women: "wm", female: "fm",
  unisex: "uni", kinder: "ki", kids: "kd", baby: "ba",

  // Häufige Sonstiges
  links: "lk", rechts: "rk", left: "lft", right: "rgt",
  lang: "lg", kurz: "kz", long: "lng", short: "sht",
  "mit": "m", "ohne": "o",
};

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

/**
 * Gibt das SKU-Kürzel für einen Option-Wert zurück.
 * Priorität: shopMap (aus Settings) → SKU_MAP (eingebaut) → erste 3 Zeichen Fallback
 *
 * @param {string} value     - Optionswert (z. B. "Blau")
 * @param {object} shopMap   - Shop-spezifische Kürzel aus den Einstellungen { "Blau": "bl" }
 */
export function abbreviate(value, shopMap = {}) {
  if (!value) return "";
  const trimmed = value.trim();
  const key = trimmed.toLowerCase();
  // 1. Shop-Map
  if (shopMap[trimmed]) return shopMap[trimmed];
  if (shopMap[key]) return shopMap[key];
  // 2. Eingebaute Map
  if (SKU_MAP[key]) return SKU_MAP[key];
  // 3. Rein numerische Werte (Konfektionsgrößen wie 36, 38, 40 …) direkt übernehmen
  if (/^\d+$/.test(trimmed)) return trimmed;
  // 4. Fallback: erste 3 alphanumerische Zeichen
  return key.replace(/[^a-z0-9]/g, "").slice(0, 3);
}

/**
 * Generiert eine vollständige Varianten-SKU aus Präfix + Option-Werten.
 * @param {string}   prefix              – Produktpräfix (z. B. "12345")
 * @param {string[]} optionValues        – Optionswerte der Variante (z. B. ["Blau", "M"])
 * @param {object}   customAbbreviations – Produktspezifische Kürzel aus dem Metafeld (haben Vorrang)
 *
 * Beispiel: generateSku("12345", ["Blau", "M"], {"Blau": "bl"}) → "12345-bl-m"
 */
/**
 * @param {string}   prefix              – Produktpräfix
 * @param {string[]} optionValues        – Optionswerte der Variante
 * @param {object}   productAbbreviations – Produktspezifische Kürzel (haben höchste Priorität)
 * @param {object}   shopAbbreviations    – Shop-weite Kürzel aus den Einstellungen
 */
export function generateSku(prefix, optionValues, productAbbreviations = {}, shopAbbreviations = {}) {
  const abbrev = (v) => productAbbreviations[v] ?? abbreviate(v, shopAbbreviations);
  const parts = [prefix.trim(), ...optionValues.map(abbrev)].filter(Boolean);
  return parts.join("-").toLowerCase();
}
