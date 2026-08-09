const DEEPL_LANG_MAP = {
  en: "EN-GB",
  pt: "PT-PT",
};

function toDeepLTargetLang(locale) {
  return DEEPL_LANG_MAP[locale.toLowerCase()] ?? locale.toUpperCase();
}

function toDeepLSourceLang(locale) {
  // DeepL source_lang hat keine Regionalvarianten (z.B. "EN" statt "EN-GB")
  return toDeepLTargetLang(locale).split("-")[0];
}

// Übersetzt einen einzelnen Text via DeepL. isHtml erhält HTML-Tags beim Übersetzen.
export async function translateText(text, { targetLocale, sourceLocale, isHtml = false }) {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY ist nicht gesetzt");
  if (!text?.trim()) return "";

  const host = apiKey.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";

  const params = new URLSearchParams();
  params.append("text", text);
  params.append("target_lang", toDeepLTargetLang(targetLocale));
  if (sourceLocale) params.append("source_lang", toDeepLSourceLang(sourceLocale));
  if (isHtml) params.append("tag_handling", "html");

  const res = await fetch(`https://${host}/v2/translate`, {
    method: "POST",
    headers: {
      "Authorization": `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepL-Fehler (${res.status}): ${body || res.statusText}`);
  }

  const json = await res.json();
  return json.translations?.[0]?.text ?? "";
}
