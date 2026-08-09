// Sprachcode → ISO-Ländercode für die SVG-Flaggen aus country-flag-icons
// (repräsentative Flagge pro Sprache — "en" zeigt UK, nicht US).
const COUNTRY_CODES = {
  de: "DE",
  en: "GB",
  fr: "FR",
  es: "ES",
  it: "IT",
  nl: "NL",
  pt: "PT",
  pl: "PL",
  sv: "SE",
  da: "DK",
  no: "NO",
  fi: "FI",
  cs: "CZ",
  sk: "SK",
  hu: "HU",
  ro: "RO",
  el: "GR",
  tr: "TR",
  ru: "RU",
  uk: "UA",
  ja: "JP",
  ko: "KR",
  zh: "CN",
  ar: "SA",
};

export function getLocaleCountryCode(locale) {
  if (!locale) return null;
  const lang = locale.split("-")[0].toLowerCase();
  return COUNTRY_CODES[lang] ?? null;
}
