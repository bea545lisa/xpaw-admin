import db from "../db.server";
import { DEFAULT_SKU_FORMAT } from "../utils/skuFormat.js";
export { DEFAULT_SKU_FORMAT };

export async function getSetting(shop, key, defaultValue = null) {
  try {
    const row = await db.appSettings.findUnique({
      where: { shop_key: { shop, key } },
    });
    return row ? JSON.parse(row.value) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setSetting(shop, key, value) {
  await db.appSettings.upsert({
    where: { shop_key: { shop, key } },
    update: { value: JSON.stringify(value) },
    create: { shop, key, value: JSON.stringify(value) },
  });
}

export async function getSkuFormat(shop) {
  return getSetting(shop, "sku_format", DEFAULT_SKU_FORMAT);
}

export async function getSkuAbbreviations(shop) {
  return getSetting(shop, "sku_abbreviations", null); // null = nur eingebaute Map verwenden
}

// Store-weite Standard-Reihenfolge für Metafields (Liste von Keys). Einzelne Produkte
// können das per Drag & Drop individuell überschreiben (gespeichert als Produkt-Metafield).
export async function getMetafieldOrder(shop) {
  return getSetting(shop, "metafield_order", []);
}

export async function setMetafieldOrder(shop, order) {
  await setSetting(shop, "metafield_order", order);
}
