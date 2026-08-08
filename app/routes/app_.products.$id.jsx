import { useLoaderData, useNavigate, useLocation, useFetcher } from "react-router";
import AppLayout from "../components/layout/AppLayout";
import { useColorScheme } from "../context/ColorSchemeContext";
import { authenticate } from "../shopify.server";
import { SkeletonBodyText, SkeletonDisplayText, Layout, Card, BlockStack, InlineStack, Text, Badge, Modal, Toast, Icon, Button, TextField,} from "@shopify/polaris";
import { ArrowLeftIcon, GlobeIcon, EditIcon } from "@shopify/polaris-icons";
import { useEffect, useState } from "react";

import {
  updateProductOptions,
  createStagedUpload,
  addProductMedia,
  createStandaloneFile,
  reorderProductMedia,
  deleteProductMedia,
} from "../services/product.server";

import { useProductOptions } from "../hooks/useProductOptions.js";
import { useVariantEdit } from "../hooks/useVariantEdit.js";
import { useImageUpload } from "../hooks/useImageUpload.jsx";

import { normalizeOptions } from "../utils/productOptions.js";
import { formatDate } from "../utils/dateFunctions.js";
import { getSkuFormat, getSkuAbbreviations, getMetafieldOrder, setMetafieldOrder } from "../services/settings.server";

import ProductDetailSeo from "../components/product/detail/ProductDetailSeo.jsx";
import ProductDetailDescription from "../components/product/detail/ProductDetailDescription.jsx";
import ProductDetailInfos from "../components/product/detail/ProductDetailInfos.jsx";
import ProductDetailOrganisation from "../components/product/detail/ProductDetailOrganisation.jsx";
import ProductDetailTabs from "../components/product/detail/ProductDetailTabs.jsx";

import ImagesSection from "../components/shared/ImagesSection.jsx";
import LocaleFlag from "../components/shared/LocaleFlag.jsx";

// ─── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);
  const shop = requestUrl.searchParams.get("shop") || session.shop;

  const res = await admin.graphql(`
    query getProduct($id: ID!) {
      product(id: $id) {
        id title handle status description vendor productType createdAt updatedAt tags
        onlineStorePreviewUrl
        seo { title description }
        featuredImage { url altText }
        images(first: 10) {
          edges { node { id url altText } }
        }
        collections(first: 20) {
          edges { node { id title } }
        }
        options { id name values optionValues { id name } }
        optionSwatchesMetafield: metafield(namespace: "custom", key: "option_swatches") { value }
        metafields(first: 20) {
          edges {
            node {
              id namespace key type value
              definition { id name }
              references(first: 50) {
                edges {
                  node {
                    ... on Metaobject {
                      id handle type
                      fields { key value }
                    }
                  }
                }
              }
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              id title price compareAtPrice
              inventoryQuantity barcode sku
              selectedOptions { name value }
              image { id url altText }
              inventoryItem { id requiresShipping tracked }
            }
          }
        }
        media(first: 10) {
          edges {
            node {
              id
              mediaContentType

              ... on MediaImage {
                image {
                  id
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  `, { variables: { id: `gid://shopify/Product/${params.id}` } });

  const data = await res.json();

  // Alle Store-Tags für Autocomplete
  let allTags = [];
  try {
    const tagsRes = await admin.graphql(`query { productTags(first: 250) { edges { node } } }`);
    const tagsJson = await tagsRes.json();
    allTags = tagsJson.data?.productTags?.edges?.map(e => e.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  let allVendors = [];
  let allProductTypes = [];
  try {
    const metaRes = await admin.graphql(`
      query {
        products(first: 100) {
          nodes {
            vendor
            productType
          }
        }
      }
    `);
    const metaJson = await metaRes.json();
    const nodes = metaJson.data?.products?.nodes ?? [];
    allVendors = [...new Set(nodes.map((node) => node.vendor).filter(Boolean))].sort();
    allProductTypes = [...new Set(nodes.map((node) => node.productType).filter(Boolean))].sort();
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  let allCollections = [];
  try {
    const collectionsRes = await admin.graphql(`
      query {
        collections(first: 250) {
          edges {
            node {
              id
              title
              image { url altText }
            }
          }
        }
      }
    `);
    const collectionsJson = await collectionsRes.json();
    allCollections = collectionsJson.data?.collections?.edges?.map((edge) => edge.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  // Lager-Location (erste Location)
  const locRes = await admin.graphql(`query { locations(first: 1) { edges { node { id } } } }`);
  const locJson = await locRes.json();
  const locationId = locJson.data.locations.edges[0]?.node?.id ?? null;

  // Alle im Store existierenden Produkt-Metafield-Definitionen (für Schnell-Anlegen-Buttons)
  let allMetafieldDefinitions = [];
  try {
    const defsRes = await admin.graphql(`
      query {
        metafieldDefinitions(ownerType: PRODUCT, first: 100) {
          edges { node { id name namespace key type { name } } }
        }
      }
    `);
    const defsJson = await defsRes.json();
    allMetafieldDefinitions = defsJson.data?.metafieldDefinitions?.edges?.map(e => e.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  // Aktive Shop-Sprachen (für Metaobject-Übersetzungen bei Eigenschaften)
  let locales = [];
  let shopId = null;
  let fieldLabels = {};
  try {
    const localesRes = await admin.graphql(`
      query {
        shopLocales { locale name primary published }
        shop { id metafield(namespace: "custom", key: "field_labels") { value } }
      }
    `);
    const localesJson = await localesRes.json();
    locales = (localesJson.data?.shopLocales ?? []).filter(l => l.published);
    shopId = localesJson.data?.shop?.id ?? null;
    try { fieldLabels = JSON.parse(localesJson.data?.shop?.metafield?.value ?? "{}"); } catch { /* leer */ }
  } catch (e) { /* falls Scope fehlt: leer */ }

  const [skuFormat, skuAbbreviations, defaultMetafieldOrder] = await Promise.all([
    getSkuFormat(shop),
    getSkuAbbreviations(shop),
    getMetafieldOrder(shop),
  ]);

  let optionSwatches = {};
  try { optionSwatches = JSON.parse(data.data.product?.optionSwatchesMetafield?.value ?? "{}"); } catch { /* leer */ }

  return { product: data.data.product, allTags, allVendors, allProductTypes, allCollections, allMetafieldDefinitions, defaultMetafieldOrder, locales, shopId, fieldLabels, optionSwatches, locationId, shop, skuFormat, skuAbbreviations };
};

// ─── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const type = formData.get("action");

  if (type === "saveMetafieldOrder") {
    const scope = formData.get("scope"); // "default" (store-weit) oder "product" (nur dieses Produkt)
    const order = JSON.parse(formData.get("order") || "[]");

    if (scope === "default") {
      await setMetafieldOrder(session.shop, order);
      return { ok: true, type: "saveMetafieldOrder", scope, order };
    }

    // Produkt-Override: als verstecktes Metafield am Produkt speichern
    await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key type value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: "rexpaw",
          key: "metafields_order",
          type: "json",
          value: JSON.stringify(order),
        }],
      },
    });
    return { ok: true, type: "saveMetafieldOrder", scope, order };
  }

  if (type === "duplicate") {
    const res = await admin.graphql(`
  mutation($productId: ID!, $newTitle: String!) {
    productDuplicate(productId: $productId, newTitle: $newTitle, includeImages: true) {
      newProduct { id }
      userErrors { field message }
    }
  }
`, {
      variables: {
        productId: formData.get("id"),
        newTitle: `${formData.get("title")} *** KOPIE ***`,
      }
    });
    const json = await res.json();
    const newId = json.data?.productDuplicate?.newProduct?.id?.split("/").pop();
    return { ok: true, type: "duplicate", newId };
  }

  // SKU oder Barcode einer Variante
  // alle Felder einer Variante auf einmal speichern
  if (type === "updateVariantAll") {
    const variantId = formData.get("variantId");
    const productId = formData.get("productId");
    await admin.graphql(`
      mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }
    `, {
      variables: {
        productId,
        variants: [{
          id: variantId,
          price: formData.get("price"),
          compareAtPrice: formData.get("compareAtPrice") || null,
          barcode: formData.get("barcode") || null,
          inventoryItem: { sku: formData.get("sku") },
        }],
      },
    });
    const inventoryItemId = formData.get("inventoryItemId");
    const locId = formData.get("locationId");
    const quantity = parseInt(formData.get("quantity"), 10);
    if (inventoryItemId && locId && !isNaN(quantity)) {
      await admin.graphql(`
        mutation($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            name: "available", reason: "correction", ignoreCompareQuantity: true,
            quantities: [{ inventoryItemId, locationId: locId, quantity }],
          },
        },
      });
    }
    return { ok: true, type: "updateVariantAll", variantId };
  }

  // Bild zuweisen für Variante
  if (type === "assignVariantImage") {
    const variantId = formData.get("variantId");
    const productId = formData.get("productId");
    const rawMediaId = formData.get("mediaId");
    const mediaId = rawMediaId && rawMediaId !== "null" ? rawMediaId : null;

    // Aktuell zugeordnete Medien der Variante abfragen
    const variantRes = await admin.graphql(`
    query($id: ID!) {
      productVariant(id: $id) {
        media(first: 10) {
          edges { node { id } }
        }
      }
    }
  `, { variables: { id: variantId } });
    const variantJson = await variantRes.json();
    const currentMediaIds = variantJson.data?.productVariant?.media?.edges?.map(e => e.node.id) ?? [];

    // Alte Bilder entfernen
    if (currentMediaIds.length > 0) {
      await admin.graphql(`
      mutation($productId: ID!, $variantMedia: [ProductVariantDetachMediaInput!]!) {
        productVariantDetachMedia(productId: $productId, variantMedia: $variantMedia) {
          userErrors { field message }
        }
      }
    `, {
        variables: {
          productId,
          variantMedia: [{ variantId, mediaIds: currentMediaIds }],
        },
      });
    }

    // Neues Bild zuweisen (falls nicht "kein Bild")
    if (mediaId) {
      await admin.graphql(`
      mutation($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
        productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
          userErrors { field message }
        }
      }
    `, {
        variables: {
          productId,
          variantMedia: [{ variantId, mediaIds: [mediaId] }],
        },
      });
    }

    return { ok: true, type: "assignVariantImage" };
  }

  // Status
  if (type === "updateStatus") {
    const res = await admin.graphql(`
      mutation($id: ID!, $status: ProductStatus!) {
        productUpdate(input: { id: $id, status: $status }) {
          product { id status }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), status: formData.get("status") } });
    const data = await res.json();
    return { ok: true, type: "updateStatus", product: data.data.productUpdate.product };
  }

  if (type === "updateTitle") {
    const res = await admin.graphql(`
      mutation($id: ID!, $title: String!) {
        productUpdate(input: { id: $id, title: $title }) {
          product { id title }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), title: formData.get("title") } });
    const data = await res.json();
    const errors = data.data?.productUpdate?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "updateTitle", error: errors[0].message };
    return { ok: true, type: "updateTitle", title: data.data.productUpdate.product.title };
  }

  // Übersetzung von Options-Namen (Größe, Farbe...) und Options-Werten (S, M, Rot...).
  // Beides sind eigene übersetzbare Shopify-Ressourcen (PRODUCT_OPTION / PRODUCT_OPTION_VALUE),
  // unabhängig vom Produkt-Titel — daher pro ID einzeln abgefragt.
  if (type === "getOptionTranslations") {
    const ids = JSON.parse(formData.get("ids") || "[]");
    const locales = JSON.parse(formData.get("locales") || "[]");

    const result = {};
    await Promise.all(ids.map(async (id) => {
      const contentRes = await admin.graphql(`
        query($id: ID!) {
          translatableResource(resourceId: $id) {
            translatableContent { key value digest }
          }
        }
      `, { variables: { id } });
      const contentJson = await contentRes.json();
      const nameContent = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === "name");

      const translations = {};
      for (const locale of locales) {
        const tRes = await admin.graphql(`
          query($id: ID!, $locale: String!) {
            translatableResource(resourceId: $id) {
              translations(locale: $locale) { key value locale }
            }
          }
        `, { variables: { id, locale } });
        const tJson = await tRes.json();
        translations[locale] = (tJson.data?.translatableResource?.translations ?? []).find((t) => t.key === "name")?.value ?? "";
      }

      result[id] = { digest: nameContent?.digest, translations };
    }));

    return { ok: true, type: "getOptionTranslations", data: result };
  }

  if (type === "saveOptionTranslation") {
    const id = formData.get("id");
    const locale = formData.get("locale");
    const value = formData.get("value");
    const digest = formData.get("digest");

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id, translations: [{ locale, key: "name", value, translatableContentDigest: digest }] } });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "saveOptionTranslation", error: errors[0].message };
    return { ok: true, type: "saveOptionTranslation", id, locale, value };
  }

  // Option-Name + alle seine Werte für eine Sprache in einem Rutsch per DeepL übersetzen
  if (type === "autoTranslateOption") {
    const ids = JSON.parse(formData.get("ids") || "[]");
    const locale = formData.get("locale");
    const sourceLocale = formData.get("sourceLocale");
    const { translateText } = await import("../services/deepl.server");

    const results = [];
    try {
      for (const id of ids) {
        const contentRes = await admin.graphql(`
          query($id: ID!) {
            translatableResource(resourceId: $id) {
              translatableContent { key value digest }
            }
          }
        `, { variables: { id } });
        const contentJson = await contentRes.json();
        const nameContent = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === "name");
        if (!nameContent?.value?.trim() || !nameContent.digest) continue;

        const translated = await translateText(nameContent.value, { targetLocale: locale, sourceLocale, isHtml: false });
        if (!translated) continue;

        const res = await admin.graphql(`
          mutation($id: ID!, $translations: [TranslationInput!]!) {
            translationsRegister(resourceId: $id, translations: $translations) {
              userErrors { field message }
            }
          }
        `, { variables: { id, translations: [{ locale, key: "name", value: translated, translatableContentDigest: nameContent.digest }] } });
        const data = await res.json();
        const errors = data.data?.translationsRegister?.userErrors ?? [];
        if (errors.length) continue;

        results.push({ id, value: translated });
      }
    } catch (e) {
      return { ok: false, type: "autoTranslateOption", error: e.message };
    }

    if (results.length === 0) return { ok: false, type: "autoTranslateOption", error: "Nichts zu übersetzen" };
    return { ok: true, type: "autoTranslateOption", locale, results };
  }

  // Beschreibung
  if (type === "updateDescription") {
    await admin.graphql(`
      mutation($id: ID!, $descriptionHtml: String!) {
        productUpdate(input: { id: $id, descriptionHtml: $descriptionHtml }) {
          product { id }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), descriptionHtml: formData.get("description") } });
    return { ok: true, type: "updateDescription" };
  }

  // Übersetzbare Inhalte (Titel/Beschreibung/Meta-Titel/Meta-Beschreibung) + Digest +
  // bestehende Übersetzungen des Produkts laden
  if (type === "getProductTranslations") {
    const id = formData.get("id");
    const locales = JSON.parse(formData.get("locales") || "[]");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest locale }
        }
      }
    `, { variables: { id } });
    const contentJson = await contentRes.json();
    const translatableContent = contentJson.data?.translatableResource?.translatableContent ?? [];

    const translations = {};
    for (const locale of locales) {
      const tRes = await admin.graphql(`
        query($id: ID!, $locale: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $locale) { key value locale }
          }
        }
      `, { variables: { id, locale } });
      const tJson = await tRes.json();
      translations[locale] = tJson.data?.translatableResource?.translations ?? [];
    }

    return { ok: true, type: "getProductTranslations", translatableContent, translations };
  }

  if (type === "saveProductTranslation") {
    const id = formData.get("id");
    const locale = formData.get("locale");
    const key = formData.get("key");
    const value = formData.get("value");
    const digest = formData.get("digest");

    if (!value?.trim()) {
      const res = await admin.graphql(`
        mutation($id: ID!, $translationKeys: [String!]!, $locales: [String!]!) {
          translationsRemove(resourceId: $id, translationKeys: $translationKeys, locales: $locales) {
            userErrors { field message }
          }
        }
      `, { variables: { id, translationKeys: [key], locales: [locale] } });
      const data = await res.json();
      const errors = data.data?.translationsRemove?.userErrors ?? [];
      if (errors.length) return { ok: false, type: "saveProductTranslation", error: errors[0].message };
      return { ok: true, type: "saveProductTranslation", locale, key, value: "" };
    }

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id, translations: [{ locale, key, value, translatableContentDigest: digest }] } });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "saveProductTranslation", error: errors[0].message };
    return { ok: true, type: "saveProductTranslation", locale, key, value };
  }

  // Alle übersetzbaren Felder (Titel/Beschreibung/Meta-Titel/Meta-Beschreibung) auf einmal
  // per DeepL übersetzen und direkt speichern.
  if (type === "autoTranslateProduct") {
    const id = formData.get("id");
    const locale = formData.get("locale");
    const sourceLocale = formData.get("sourceLocale");
    const { translateText } = await import("../services/deepl.server");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id } });
    const contentJson = await contentRes.json();
    const translatableContent = contentJson.data?.translatableResource?.translatableContent ?? [];

    const translations = [];
    try {
      for (const content of translatableContent) {
        if (!["title", "body_html", "meta_title", "meta_description"].includes(content.key)) continue;
        if (!content.value?.trim()) continue;
        const translated = await translateText(content.value, {
          targetLocale: locale,
          sourceLocale,
          isHtml: content.key === "body_html",
        });
        if (translated) {
          translations.push({ locale, key: content.key, value: translated, translatableContentDigest: content.digest });
        }
      }
    } catch (e) {
      return { ok: false, type: "autoTranslateProduct", error: e.message };
    }

    // URL-Handle nicht per DeepL übersetzen (wäre kein sinnvoller Fließtext), sondern aus dem
    // übersetzten Titel ableiten (slugifiziert) — wie es Shopify im Admin selbst vorschlägt.
    const handleContent = translatableContent.find((c) => c.key === "handle");
    const translatedTitle = translations.find((t) => t.key === "title")?.value;
    if (handleContent?.digest && translatedTitle) {
      const slug = translatedTitle
        .trim().toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      // Gleicher Slug wie das deutsche Original (z.B. weil DeepL den Titel unverändert lässt)
      // würde Shopify sonst mit einem falschen "-1"-Suffix versehen, da der Handle shopweit
      // eindeutig sein muss. Dann lieber keine eigene Übersetzung setzen.
      if (slug && slug !== handleContent.value) {
        translations.push({ locale, key: "handle", value: slug, translatableContentDigest: handleContent.digest });
      }
    }

    if (translations.length === 0) return { ok: false, type: "autoTranslateProduct", error: "Nichts zu übersetzen (Original leer)" };

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id, translations } });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "autoTranslateProduct", error: errors[0].message };

    return { ok: true, type: "autoTranslateProduct", locale, translations };
  }

  // Einzelnes Feld (title/body_html/meta_title/meta_description) für eine Sprache übersetzen
  if (type === "autoTranslateProductField") {
    const id = formData.get("id");
    const key = formData.get("key");
    const locale = formData.get("locale");
    const sourceLocale = formData.get("sourceLocale");
    const { translateText } = await import("../services/deepl.server");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id } });
    const contentJson = await contentRes.json();
    const content = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === key);
    if (!content?.value?.trim() || !content.digest) {
      return { ok: false, type: "autoTranslateProductField", key, error: "Original zuerst speichern" };
    }

    let translated;
    try {
      translated = await translateText(content.value, {
        targetLocale: locale, sourceLocale,
        isHtml: key === "body_html",
      });
    } catch (e) {
      return { ok: false, type: "autoTranslateProductField", key, error: e.message };
    }
    if (!translated) return { ok: false, type: "autoTranslateProductField", key, error: "Übersetzung fehlgeschlagen" };

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id, translations: [{ locale, key, value: translated, translatableContentDigest: content.digest }] } });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "autoTranslateProductField", key, error: errors[0].message };

    return { ok: true, type: "autoTranslateProductField", key, locale, value: translated };
  }

  // Collection-Pill: Titel-Übersetzung direkt von der Produktseite aus (Klick auf die Pill)
  if (type === "updateCollectionTitle") {
    const id = formData.get("id");
    const title = formData.get("title");
    const res = await admin.graphql(`
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id title }
          userErrors { field message }
        }
      }
    `, { variables: { input: { id, title } } });
    const data = await res.json();
    const errors = data.data?.collectionUpdate?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "updateCollectionTitle", error: errors[0].message };
    return { ok: true, type: "updateCollectionTitle", id, title: data.data.collectionUpdate.collection.title };
  }

  if (type === "getCollectionPillTranslation") {
    const id = formData.get("id");
    const locales = JSON.parse(formData.get("locales") || "[]");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id } });
    const contentJson = await contentRes.json();
    const titleContent = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === "title");

    const translations = {};
    for (const locale of locales) {
      const tRes = await admin.graphql(`
        query($id: ID!, $locale: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $locale) { key value locale }
          }
        }
      `, { variables: { id, locale } });
      const tJson = await tRes.json();
      translations[locale] = (tJson.data?.translatableResource?.translations ?? []).find((t) => t.key === "title")?.value ?? "";
    }

    return { ok: true, type: "getCollectionPillTranslation", id, digest: titleContent?.digest, translations };
  }

  if (type === "saveCollectionPillTranslation") {
    const id = formData.get("id");
    const locale = formData.get("locale");
    const value = formData.get("value");
    const digest = formData.get("digest");

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id, translations: [{ locale, key: "title", value, translatableContentDigest: digest }] } });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "saveCollectionPillTranslation", error: errors[0].message };
    return { ok: true, type: "saveCollectionPillTranslation", id, locale, value };
  }

  if (type === "autoTranslateCollectionPill") {
    const id = formData.get("id");
    const locale = formData.get("locale");
    const sourceLocale = formData.get("sourceLocale");
    const { translateText } = await import("../services/deepl.server");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id } });
    const contentJson = await contentRes.json();
    const titleContent = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === "title");
    if (!titleContent?.value?.trim() || !titleContent.digest) {
      return { ok: false, type: "autoTranslateCollectionPill", error: "Original leer" };
    }

    let translated;
    try {
      translated = await translateText(titleContent.value, { targetLocale: locale, sourceLocale, isHtml: false });
    } catch (e) {
      return { ok: false, type: "autoTranslateCollectionPill", error: e.message };
    }
    if (!translated) return { ok: false, type: "autoTranslateCollectionPill", error: "Übersetzung fehlgeschlagen" };

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id, translations: [{ locale, key: "title", value: translated, translatableContentDigest: titleContent.digest }] } });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { ok: false, type: "autoTranslateCollectionPill", error: errors[0].message };

    return { ok: true, type: "autoTranslateCollectionPill", id, locale, value: translated };
  }

  // Collections und Tags
  if (type === "updateOrganization") {
    const res = await admin.graphql(`
      mutation($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            vendor
            productType
          }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          id: formData.get("id"),
          vendor: formData.get("vendor") || null,
          productType: formData.get("productType") || null,
        },
      },
    });
    const data = await res.json();
    return {
      ok: true,
      type: "updateOrganization",
      product: data?.data?.productUpdate?.product ?? null,
      userErrors: data?.data?.productUpdate?.userErrors ?? [],
    };
  }

  // Optionen und Varianten
  if (type === "updateOptions" || type === "update") {
    const parsedOptions = JSON.parse(formData.get("options") || "[]");
    const validOptions = parsedOptions
      .map((option) => ({
        id: option.id || null,
        name: String(option.name ?? "").trim(),
        values: Array.isArray(option.values)
          ? option.values.map((value) => String(value).trim()).filter(Boolean)
          : [],
      }))
      .filter((option) => option.name && option.values.length > 0);

    await updateProductOptions(admin, formData.get("id"), validOptions);

    // Kürzel-Metafeld speichern (falls mitgeschickt)
    const abbreviationsRaw = formData.get("abbreviations");
    if (abbreviationsRaw) {
      await admin.graphql(`
        mutation($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }
      `, {
        variables: {
          metafields: [{
            ownerId: formData.get("id"),
            namespace: "rexpaw",
            key: "option_abbreviations",
            type: "json",
            value: abbreviationsRaw,
          }],
        },
      });
    }

    const refreshRes = await admin.graphql(`
    query($id: ID!) {
      product(id: $id) {
        id
        options { id name values optionValues { id name } }
        variants(first: 50) {
          edges {
            node {
              id title price compareAtPrice
              inventoryQuantity barcode sku
              selectedOptions { name value }
              image { id url altText }
              inventoryItem { id requiresShipping tracked }
            }
          }
        }
      }
    }
  `, { variables: { id: formData.get("id") } });
    const data = await refreshRes.json();
    return {
      ok: true,
      type: "updateOptions",
      product: data?.data?.product ?? null,
    };
  }

  // SEO
  if (type === "updateSeo") {
    const product = {
      id: formData.get("id"),
      handle: formData.get("handle") || null,
      seo: {
        title: formData.get("seoTitle") || null,
        description: formData.get("seoDescription") || null,
      },
    };

    const res = await admin.graphql(`
      mutation($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          userErrors { field message }
          product {
            id
            handle
            seo { title description }
          }
        }
      }
    `, { variables: { product } });

    const data = await res.json();
    return {
      ok: true,
      type: "updateSeo",
      product: data?.data?.productUpdate?.product ?? null,
      userErrors: data?.data?.productUpdate?.userErrors ?? [],
    };
  }

  // Tags
  if (type === "updateTags") {
    const tags = JSON.parse(formData.get("tags"));
    const res = await admin.graphql(`
      mutation($id: ID!, $tags: [String!]!) {
        productUpdate(input: { id: $id, tags: $tags }) {
          product { id tags }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), tags } });
    const data = await res.json();
    return { ok: true, type: "updateTags", tags: data.data.productUpdate.product.tags };
  }

  // Collections durchsuchen
  if (type === "searchCollections") {
    const res = await admin.graphql(`
      query($query: String!) {
        collections(first: 8, query: $query) {
          edges { node { id title } }
        }
      }
    `, { variables: { query: formData.get("query") } });
    const data = await res.json();
    return {
      ok: true, type: "searchCollections",
      collections: data.data.collections.edges.map(e => e.node),
    };
  }

  // Produkt zur Collection hinzufügen
  if (type === "addToCollection") {
    await admin.graphql(`
      mutation($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("collectionId"), productIds: [formData.get("productId")] } });
    return {
      ok: true, type: "addToCollection",
      collection: { id: formData.get("collectionId"), title: formData.get("collectionTitle") },
    };
  }

  // Produkt aus Collection entfernen
  if (type === "removeFromCollection") {
    await admin.graphql(`
      mutation($id: ID!, $productIds: [ID!]!) {
        collectionRemoveProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("collectionId"), productIds: [formData.get("productId")] } });
    return { ok: true, type: "removeFromCollection", collectionId: formData.get("collectionId") };
  }

  // Metafield hinzufügen
  if (type === "createMetafield") {
    const namespace = formData.get("namespace");
    const key = formData.get("key");
    const metafieldType = formData.get("type");
    const name = formData.get("name") || key;

    // Definition anlegen, damit das Metafield im Storefront/Theme verfügbar ist
    // (ohne Definition mit Storefront-Zugriff bleibt ein per API gesetztes Metafield
    // in der Storefront API unsichtbar). Falls die Definition schon existiert,
    // liefert Shopify einen userError ("TAKEN"), den wir ignorieren.
    await admin.graphql(`
      mutation($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message code }
        }
      }
    `, {
      variables: {
        definition: {
          name,
          namespace,
          key,
          type: metafieldType,
          ownerType: "PRODUCT",
          access: { storefront: "PUBLIC_READ" },
        },
      },
    });

    const res = await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key type value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace,
          key,
          type: metafieldType,
          value: formData.get("value"),
        }],
      },
    });
    const json = await res.json();
    const metafield = json.data?.metafieldsSet?.metafields?.[0] ?? null;
    return { ok: true, type: "createMetafield", metafield };
  }

  // Metaobjects eines Typs durchsuchen (für list.metaobject_reference)
  if (type === "searchMetaobjects") {
    const metaobjectType = formData.get("metaobjectType");
    const res = await admin.graphql(`
      query($type: String!) {
        metaobjects(type: $type, first: 100) {
          edges { node { id handle fields { key value } } }
        }
      }
    `, { variables: { type: metaobjectType } });
    const json = await res.json();
    const metaobjects = json.data?.metaobjects?.edges?.map(e => e.node) ?? [];
    return { ok: true, type: "searchMetaobjects", metaobjects };
  }

  // Felder eines referenzierten Metaobjects bearbeiten (z.B. "eigenschaften"-Eintrag)
  if (type === "updateMetaobject") {
    const metaobjectId = formData.get("metaobjectId");
    const fields = JSON.parse(formData.get("fields") || "[]");
    const res = await admin.graphql(`
      mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject { id fields { key value } }
          userErrors { field message }
        }
      }
    `, { variables: { id: metaobjectId, metaobject: { fields } } });
    const json = await res.json();
    const metaobject = json.data?.metaobjectUpdate?.metaobject ?? null;
    return { ok: true, type: "updateMetaobject", metaobjectId, metaobject };
  }

  // Neues Metaobject anlegen (z.B. neuer "eigenschaften"-Eintrag)
  if (type === "createMetaobject") {
    const metaobjectType = formData.get("metaobjectType");
    const fields = JSON.parse(formData.get("fields") || "[]");
    const res = await admin.graphql(`
      mutation($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id handle type fields { key value } }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metaobject: {
          type: metaobjectType,
          fields,
          capabilities: { publishable: { status: "ACTIVE" } },
        },
      },
    });
    const json = await res.json();
    const metaobject = json.data?.metaobjectCreate?.metaobject ?? null;
    return { ok: true, type: "createMetaobject", metaobject };
  }

  // Store-weites Shop-Label für einen Metafield-Key in einer Sprache setzen (gleicher
  // Mechanismus wie auf der /app/metafields-Seite — gilt für alle Produkte, da der Key
  // store-weit ist, nicht produktspezifisch).
  if (type === "saveFieldLabel") {
    const shopId = formData.get("shopId");
    const locale = formData.get("locale");
    const key = formData.get("key");
    const label = formData.get("label");

    const currentRes = await admin.graphql(`
      query { shop { metafield(namespace: "custom", key: "field_labels") { value } } }
    `);
    const currentJson = await currentRes.json();
    let labels = {};
    try { labels = JSON.parse(currentJson.data?.shop?.metafield?.value ?? "{}"); } catch { /* leer */ }
    if (!labels[locale]) labels[locale] = {};
    if (label.trim()) labels[locale][key] = label.trim();
    else delete labels[locale][key];
    if (Object.keys(labels[locale]).length === 0) delete labels[locale];

    const res = await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: "custom",
          key: "field_labels",
          type: "json",
          value: JSON.stringify(labels),
        }],
      },
    });
    const json = await res.json();
    const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
    return { ok: userErrors.length === 0, type: "saveFieldLabel", locale, key, label: label.trim(), userErrors };
  }

  // Minibild (Swatch) für einen Optionswert setzen/entfernen — eigenes JSON-Metafield am
  // Produkt (custom.option_swatches), analog zum Shop-Label-Muster oben, statt Shopifys
  // natives Swatch-Feature (dessen genaue Mutation-Syntax hier nicht live verifiziert werden kann).
  if (type === "saveOptionSwatch") {
    const id = formData.get("id");
    const optionName = formData.get("optionName");
    const valueName = formData.get("valueName");
    const imageId = formData.get("imageId") || null;
    const imageUrl = formData.get("imageUrl") || null;
    const color = formData.get("color") || null;

    const currentRes = await admin.graphql(`
      query($id: ID!) {
        product(id: $id) { metafield(namespace: "custom", key: "option_swatches") { value } }
      }
    `, { variables: { id } });
    const currentJson = await currentRes.json();
    let swatches = {};
    try { swatches = JSON.parse(currentJson.data?.product?.metafield?.value ?? "{}"); } catch { /* leer */ }
    if (!swatches[optionName]) swatches[optionName] = {};
    if (imageId && imageUrl) swatches[optionName][valueName] = { imageId, imageUrl };
    else if (color) swatches[optionName][valueName] = { color };
    else delete swatches[optionName][valueName];
    if (Object.keys(swatches[optionName]).length === 0) delete swatches[optionName];

    const res = await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: id,
          namespace: "custom",
          key: "option_swatches",
          type: "json",
          value: JSON.stringify(swatches),
        }],
      },
    });
    const json = await res.json();
    const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
    return { ok: userErrors.length === 0, type: "saveOptionSwatch", optionName, valueName, imageId, imageUrl, userErrors };
  }

  // Eigenständiges Muster-/Swatch-Bild hochladen — landet NICHT in der Produkt-Bildergalerie
  // (siehe createStandaloneFile in product.server.js), kann deshalb auch nicht automatisch als
  // Varianten-Bild verwendet werden.
  if (type === "uploadSwatchFile") {
    const step = formData.get("step");

    if (step === "stage") {
      const stagedTarget = await createStagedUpload(admin, formData.get("filename"), formData.get("mimeType"));
      return { ok: true, type: "uploadSwatchFile", step: "stage", stagedTarget };
    }

    if (step === "link") {
      const result = await createStandaloneFile(admin, formData.get("resourceUrl"));
      if (result.error) return { ok: false, type: "uploadSwatchFile", step: "link", error: result.error };
      return {
        ok: true, type: "uploadSwatchFile", step: "link",
        fileId: result.file?.id ?? null,
        fileUrl: result.file?.image?.url ?? null,
      };
    }
  }

  // Übersetzbare Inhalte (Bezeichnung/Wert) + Digest + bestehende Übersetzungen eines Metaobjects laden
  if (type === "getMetaobjectTranslations") {
    const metaobjectId = formData.get("metaobjectId");
    const locales = JSON.parse(formData.get("locales") || "[]");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest locale }
        }
      }
    `, { variables: { id: metaobjectId } });
    const contentJson = await contentRes.json();
    const translatableContent = contentJson.data?.translatableResource?.translatableContent ?? [];

    const translations = {};
    for (const locale of locales) {
      const tRes = await admin.graphql(`
        query($id: ID!, $locale: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $locale) { key value locale }
          }
        }
      `, { variables: { id: metaobjectId, locale } });
      const tJson = await tRes.json();
      translations[locale] = tJson.data?.translatableResource?.translations ?? [];
    }

    return { ok: true, type: "getMetaobjectTranslations", metaobjectId, translatableContent, translations };
  }

  if (type === "saveMetaobjectTranslation") {
    const metaobjectId = formData.get("metaobjectId");
    const locale = formData.get("locale");
    const key = formData.get("key");
    const value = formData.get("value");
    const digest = formData.get("digest");

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, {
      variables: {
        id: metaobjectId,
        translations: [{ locale, key, value, translatableContentDigest: digest }],
      },
    });
    const json = await res.json();
    const userErrors = json.data?.translationsRegister?.userErrors ?? [];
    return { ok: userErrors.length === 0, type: "saveMetaobjectTranslation", metaobjectId, locale, key, value, userErrors };
  }

  // Alle übersetzbaren Felder eines Metaobjects (Bezeichnung/Wert) per DeepL übersetzen und speichern
  if (type === "autoTranslateMetaobject") {
    const metaobjectId = formData.get("metaobjectId");
    const locale = formData.get("locale");
    const sourceLocale = formData.get("sourceLocale");
    const { translateText } = await import("../services/deepl.server");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id: metaobjectId } });
    const contentJson = await contentRes.json();
    const translatableContent = contentJson.data?.translatableResource?.translatableContent ?? [];

    const translations = [];
    try {
      for (const content of translatableContent) {
        if (!content.value?.trim()) continue;
        const translated = await translateText(content.value, { targetLocale: locale, sourceLocale, isHtml: false });
        if (translated) {
          translations.push({ locale, key: content.key, value: translated, translatableContentDigest: content.digest });
        }
      }
    } catch (e) {
      return { ok: false, type: "autoTranslateMetaobject", metaobjectId, error: e.message };
    }

    if (translations.length === 0) return { ok: false, type: "autoTranslateMetaobject", metaobjectId, error: "Nichts zu übersetzen (Original leer)" };

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id: metaobjectId, translations } });
    const json = await res.json();
    const userErrors = json.data?.translationsRegister?.userErrors ?? [];
    if (userErrors.length) return { ok: false, type: "autoTranslateMetaobject", metaobjectId, error: userErrors[0].message };

    return { ok: true, type: "autoTranslateMetaobject", metaobjectId, locale, translations };
  }

  // Übersetzbaren Inhalt (Wert) + Digest + bestehende Übersetzungen eines einzelnen Metafields laden
  if (type === "getMetafieldTranslation") {
    const metafieldId = formData.get("metafieldId");
    const locales = JSON.parse(formData.get("locales") || "[]");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id: metafieldId } });
    const contentJson = await contentRes.json();
    const valueContent = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === "value");

    const translations = {};
    for (const locale of locales) {
      const tRes = await admin.graphql(`
        query($id: ID!, $locale: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $locale) { key value locale }
          }
        }
      `, { variables: { id: metafieldId, locale } });
      const tJson = await tRes.json();
      const valueTranslation = (tJson.data?.translatableResource?.translations ?? []).find((t) => t.key === "value");
      translations[locale] = valueTranslation?.value ?? "";
    }

    return { ok: true, type: "getMetafieldTranslation", metafieldId, digest: valueContent?.digest, translations };
  }

  if (type === "saveMetafieldTranslation") {
    const metafieldId = formData.get("metafieldId");
    const locale = formData.get("locale");
    const value = formData.get("value");
    const digest = formData.get("digest");

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id: metafieldId, translations: [{ locale, key: "value", value, translatableContentDigest: digest }] } });
    const json = await res.json();
    const userErrors = json.data?.translationsRegister?.userErrors ?? [];
    if (userErrors.length) return { ok: false, type: "saveMetafieldTranslation", metafieldId, error: userErrors[0].message };
    return { ok: true, type: "saveMetafieldTranslation", metafieldId, locale, value };
  }

  // Metafield-Wert per DeepL übersetzen und speichern
  if (type === "autoTranslateMetafield") {
    const metafieldId = formData.get("metafieldId");
    const locale = formData.get("locale");
    const sourceLocale = formData.get("sourceLocale");
    const { translateText } = await import("../services/deepl.server");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id: metafieldId } });
    const contentJson = await contentRes.json();
    const valueContent = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === "value");
    if (!valueContent?.value?.trim()) return { ok: false, type: "autoTranslateMetafield", metafieldId, error: "Nichts zu übersetzen (Original leer)" };

    let translated;
    try {
      translated = await translateText(valueContent.value, { targetLocale: locale, sourceLocale, isHtml: false });
    } catch (e) {
      return { ok: false, type: "autoTranslateMetafield", metafieldId, error: e.message };
    }
    if (!translated) return { ok: false, type: "autoTranslateMetafield", metafieldId, error: "Übersetzung fehlgeschlagen" };

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id: metafieldId, translations: [{ locale, key: "value", value: translated, translatableContentDigest: valueContent.digest }] } });
    const json = await res.json();
    const userErrors = json.data?.translationsRegister?.userErrors ?? [];
    if (userErrors.length) return { ok: false, type: "autoTranslateMetafield", metafieldId, error: userErrors[0].message };

    return { ok: true, type: "autoTranslateMetafield", metafieldId, locale, value: translated };
  }

  if (type === "deleteMetafield") {
    const metafieldId = formData.get("metafieldId");
    await admin.graphql(`
      mutation($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields { key }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
        }],
      },
    });
    return { ok: true, type: "deleteMetafield", metafieldId };
  }

  if (type === "updateMetafield") {
    const metafieldId = formData.get("metafieldId");
    const value = formData.get("value");
    await admin.graphql(`
    mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id value }
        userErrors { field message }
      }
    }
  `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
          type: formData.get("type"),
          value,
        }],
      },
    });

    const name = formData.get("name");
    if (name) {
      await admin.graphql(`
        mutation($definition: MetafieldDefinitionUpdateInput!) {
          metafieldDefinitionUpdate(definition: $definition) {
            updatedDefinition { id name }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          definition: {
            namespace: formData.get("namespace"),
            key: formData.get("key"),
            ownerType: "PRODUCT",
            name,
          },
        },
      });
    }

    return { ok: true, type: "updateMetafield", metafieldId, value, name };
  }

  // Bilder ---------------------------------------------------
  if (type === "uploadImage") {
  const step = formData.get("step");

  if (step === "stage") {
    const stagedTarget = await createStagedUpload(
      admin,
      formData.get("filename"),
      formData.get("mimeType")
    );
    return { ok: true, stagedTarget };
  }

  if (step === "link") {
    const media = await addProductMedia(admin, formData.get("productId"), formData.get("resourceUrl"));
    return { ok: true, mediaId: media?.id ?? null };
  }
}

  if (type === "reorderImages") {
    const mediaIds = JSON.parse(formData.get("mediaIds"));
    await reorderProductMedia(admin, formData.get("productId"), mediaIds);
    return { ok: true, type: "reorderImages" };
  }

  if (type === "deleteImage") {
    await deleteProductMedia(admin, formData.get("productId"), [formData.get("mediaId")]);
    return { ok: true, type: "deleteImage" };
  }

  // Löschen --------------------------------------------------
  if (type === "delete") {
    await admin.graphql(`
      mutation($input: ProductDeleteInput!) {
        productDelete(input: $input) { deletedProductId }
      }
    `, { variables: { input: { id: formData.get("id") } } });
    return { ok: true, type: "delete" };
  }

  return null;
};

// ─── Skeleton ────────────────────────────────────────────────────────────────────

export function HydrateFallback() {
  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <SkeletonDisplayText size="small" />
      </div>
      <Layout>
        <Layout.Section variant="oneThird">
          <SkeletonBodyText lines={3} />
        </Layout.Section>
        <Layout.Section>
          <SkeletonBodyText lines={6} />
        </Layout.Section>
      </Layout>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_TONE = { ACTIVE: "success", DRAFT: "info", ARCHIVED: "warning" };
const STATUS_LABEL = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
const STOCK_TONE = { healthy: "success", low: "warning", out: "critical" };
const STOCK_LABEL = { healthy: "In Ordnung", low: "Niedrig", out: "Ausverkauft" };

function getVariantStockState(quantity) {
  const stock = Number(quantity) || 0;
  if (stock <= 0) return { key: "out", label: STOCK_LABEL.out, tone: STOCK_TONE.out };
  if (stock <= 5) return { key: "low", label: STOCK_LABEL.low, tone: STOCK_TONE.low };
  return { key: "healthy", label: STOCK_LABEL.healthy, tone: STOCK_TONE.healthy };
}

// ─── Komponente ────────────────────────────────────────────────────────────────

export default function ProductDetail() {

  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { product, allTags = [], allVendors = [], allProductTypes = [], allCollections = [], allMetafieldDefinitions = [], defaultMetafieldOrder = [], locales = [], shopId, fieldLabels = {}, optionSwatches = {}, locationId, shop, skuFormat, skuAbbreviations } = useLoaderData();

  // Kürzel-Map aus Metafeld (rexpaw.option_abbreviations)
  const abbreviationsMap = (() => {
    const mf = product.metafields?.edges?.find(
      (e) => e.node.namespace === "rexpaw" && e.node.key === "option_abbreviations"
    );
    try { return mf ? JSON.parse(mf.node.value) : {}; } catch { return {}; }
  })();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.from ?? `/app/products${location.search}`;
  const fetcher = useFetcher();

  // ── Übersetzung (Titel/Beschreibung/SEO) ──
  const translationFetcher = useFetcher();
  const autoTranslateFetcher = useFetcher();
  // Ein eigener Fetcher pro übersetzbarem Feld-Key: verhindert, dass ein Speichervorgang eines
  // anderen Feldes (z.B. beim schnellen Durchtabben) den vorherigen noch laufenden Save
  // stillschweigend abbricht (ein einzelner geteilter Fetcher kann immer nur einen Submit
  // gleichzeitig verarbeiten).
  const saveTitleTranslationFetcher = useFetcher();
  const saveBodyTranslationFetcher = useFetcher();
  const saveHandleTranslationFetcher = useFetcher();
  const saveMetaTitleTranslationFetcher = useFetcher();
  const saveMetaDescTranslationFetcher = useFetcher();
  const translationFetcherByKey = {
    title: saveTitleTranslationFetcher,
    body_html: saveBodyTranslationFetcher,
    handle: saveHandleTranslationFetcher,
    meta_title: saveMetaTitleTranslationFetcher,
    meta_description: saveMetaDescTranslationFetcher,
  };
  const primaryLocale = locales.find((l) => l.primary)?.locale;
  const translationLocales = locales.filter((l) => !l.primary);
  const [translationData, setTranslationData] = useState(null); // { translatableContent, translations }
  const [translationDrafts, setTranslationDrafts] = useState({});
  const [autoTranslatingLocale, setAutoTranslatingLocale] = useState(null);
  const [titleEditOpen, setTitleEditOpen] = useState(false);
  const [showTitleTranslation, setShowTitleTranslation] = useState(false);
  const titleFetcher = useFetcher();
  const [titleValue, setTitleValue] = useState(product.title);
  const [titleDraft, setTitleDraft] = useState(product.title);

  // Nach jeder Änderung am deutschen Original ist der zuvor geladene Digest ungültig
  // (Shopify berechnet ihn aus dem aktuellen Wert) — ohne Neuladen würden Übersetzungen
  // mit veraltetem Digest fehlschlagen.
  const refetchProductTranslations = () => {
    if (translationLocales.length === 0) return;
    translationFetcher.submit(
      { action: "getProductTranslations", id: product.id, locales: JSON.stringify(translationLocales.map((l) => l.locale)) },
      { method: "post" }
    );
  };

  useEffect(() => {
    if (titleFetcher.state !== "idle" || titleFetcher.data?.type !== "updateTitle") return;
    const d = titleFetcher.data;
    if (!d.ok) { setToast(`Fehler: ${d.error}`); return; }
    setTitleValue(d.title);
    setToast("Titel gespeichert");
    refetchProductTranslations();
  }, [titleFetcher.state, titleFetcher.data]);

  const saveTitle = () => {
    if (!titleDraft.trim() || titleDraft === titleValue) return;
    titleFetcher.submit({ action: "updateTitle", id: product.id, title: titleDraft.trim() }, { method: "post" });
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.type === "updateDescription" || fetcher.data.type === "updateSeo") {
      refetchProductTranslations();
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (translationLocales.length === 0) return;
    translationFetcher.submit(
      { action: "getProductTranslations", id: product.id, locales: JSON.stringify(translationLocales.map((l) => l.locale)) },
      { method: "post" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (translationFetcher.state !== "idle" || translationFetcher.data?.type !== "getProductTranslations") return;
    const d = translationFetcher.data;
    setTranslationData({ translatableContent: d.translatableContent, translations: d.translations });
  }, [translationFetcher.state, translationFetcher.data]);


  useEffect(() => {
    if (autoTranslateFetcher.state !== "idle" || autoTranslateFetcher.data?.type !== "autoTranslateProduct") return;
    const d = autoTranslateFetcher.data;
    setAutoTranslatingLocale(null);
    if (!d.ok) { setToast(`Fehler: ${d.error}`); return; }
    setTranslationData((prev) => {
      if (!prev) return prev;
      return { ...prev, translations: { ...prev.translations, [d.locale]: d.translations } };
    });
    setTranslationDrafts((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${d.locale}:`)) delete next[k];
      }
      return next;
    });
    setToast("Automatisch übersetzt");
  }, [autoTranslateFetcher.state, autoTranslateFetcher.data]);

  const autoTranslateFieldFetcher = useFetcher();
  const [autoTranslatingFieldKey, setAutoTranslatingFieldKey] = useState(null); // `${key}:${locale}`

  useEffect(() => {
    if (autoTranslateFieldFetcher.state !== "idle" || autoTranslateFieldFetcher.data?.type !== "autoTranslateProductField") return;
    const d = autoTranslateFieldFetcher.data;
    setAutoTranslatingFieldKey(null);
    if (!d.ok) { setToast(`Fehler: ${d.error}`); return; }
    setTranslationData((prev) => {
      if (!prev) return prev;
      const nextTranslations = { ...prev.translations };
      const list = (nextTranslations[d.locale] ?? []).filter((t) => t.key !== d.key);
      list.push({ key: d.key, value: d.value, locale: d.locale });
      nextTranslations[d.locale] = list;
      return { ...prev, translations: nextTranslations };
    });
    setTranslationDrafts((prev) => {
      const next = { ...prev };
      delete next[`${d.locale}:${d.key}`];
      return next;
    });
    setToast("Automatisch übersetzt");
  }, [autoTranslateFieldFetcher.state, autoTranslateFieldFetcher.data]);

  const handleAutoTranslateField = (key, locale) => {
    setAutoTranslatingFieldKey(`${key}:${locale}`);
    autoTranslateFieldFetcher.submit(
      { action: "autoTranslateProductField", id: product.id, key, locale, sourceLocale: primaryLocale ?? "de" },
      { method: "post" }
    );
  };

  const [pendingAutoTranslateLocale, setPendingAutoTranslateLocale] = useState(null);

  const runAutoTranslateProduct = (locale) => {
    setAutoTranslatingLocale(locale);
    autoTranslateFetcher.submit(
      { action: "autoTranslateProduct", id: product.id, locale, sourceLocale: primaryLocale ?? "de" },
      { method: "post" }
    );
  };

  const handleAutoTranslateProduct = (locale) => {
    const hasExisting = ["title", "body_html", "meta_title", "meta_description", "handle"].some(
      (key) => translationData?.translations?.[locale]?.some((t) => t.key === key && t.value?.trim())
    );
    if (hasExisting) {
      setPendingAutoTranslateLocale(locale);
      return;
    }
    runAutoTranslateProduct(locale);
  };

  const translationDraftKey = (locale, key) => `${locale}:${key}`;

  // Ob für ein Feld (title/body_html/meta_title/meta_description/handle) in irgendeiner
  // Sprache schon eine Übersetzung existiert — für den Flaggen-Indikator ohne Klick.
  const hasFieldTranslation = (key) => translationLocales.some((loc) =>
    translationData?.translations?.[loc.locale]?.some((t) => t.key === key && t.value?.trim())
  );

  // Welche Sprachen für ein Feld (oder mehrere Keys, z.B. alle SEO-Felder) bereits eine
  // Übersetzung haben — für die Flaggen-Anzeige (zeigt die übersetzten Sprachen, nicht Deutsch).
  const translatedLocalesForFields = (...keys) => translationLocales.filter((loc) =>
    keys.some((key) => translationData?.translations?.[loc.locale]?.some((t) => t.key === key && t.value?.trim()))
  );

  // Eigenständiger fetch() statt geteiltem useFetcher: mehrere Übersetzungsfelder können kurz
  // hintereinander per onBlur speichern (z.B. beim Durchtabben) — ein gemeinsamer Fetcher würde
  // einen späteren Submit den früheren stillschweigend abbrechen lassen (Datenverlust ohne Fehler).
  const saveProductTranslation = (locale, key) => {
    const content = translationData?.translatableContent?.find((c) => c.key === key);
    if (!content) { setToast("Original zuerst speichern"); return; }
    const dk = translationDraftKey(locale, key);
    const existing = translationData.translations?.[locale]?.find((t) => t.key === key)?.value ?? "";
    const value = translationDrafts[dk] ?? existing;
    const fetcherForKey = translationFetcherByKey[key];
    fetcherForKey.submit(
      { action: "saveProductTranslation", id: product.id, locale, key, value, digest: content.digest },
      { method: "post" }
    );
  };

  // Response-Handling für alle 5 Feld-Fetcher (siehe translationFetcherByKey oben).
  useEffect(() => {
    for (const fetcherForKey of Object.values(translationFetcherByKey)) {
      if (fetcherForKey.state !== "idle" || fetcherForKey.data?.type !== "saveProductTranslation") continue;
      const d = fetcherForKey.data;
      if (!d.ok) { setToast(`Fehler: ${d.error}`); continue; }
      setTranslationData((prev) => {
        if (!prev) return prev;
        const nextTranslations = { ...prev.translations };
        const list = (nextTranslations[d.locale] ?? []).filter((t) => t.key !== d.key);
        if (d.value) list.push({ key: d.key, value: d.value, locale: d.locale });
        nextTranslations[d.locale] = list;
        return { ...prev, translations: nextTranslations };
      });
      setToast("Übersetzung gespeichert");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    saveTitleTranslationFetcher.state, saveTitleTranslationFetcher.data,
    saveBodyTranslationFetcher.state, saveBodyTranslationFetcher.data,
    saveHandleTranslationFetcher.state, saveHandleTranslationFetcher.data,
    saveMetaTitleTranslationFetcher.state, saveMetaTitleTranslationFetcher.data,
    saveMetaDescTranslationFetcher.state, saveMetaDescTranslationFetcher.data,
  ]);

  // Kompakte Übersetzungszeilen für ein Feld (title/body_html/meta_title/meta_description)
  const renderProductTranslationRows = (key, { multiline, fallback } = {}) => {
    if (translationLocales.length === 0) return null;
    if (!translationData) return <Text variant="bodyXs" tone="subdued">Lade Übersetzungen…</Text>;
    const originalContent = translationData.translatableContent?.find((c) => c.key === key);
    const hasContent = !!originalContent;
    const placeholderValue = hasContent ? originalContent.value : (fallback !== undefined ? fallback : "Erst im Original speichern");
    return (
      <BlockStack gap="100">
        {translationLocales.map((loc) => {
          const dk = translationDraftKey(loc.locale, key);
          const existing = translationData.translations?.[loc.locale]?.find((t) => t.key === key)?.value ?? "";
          const isAutoTranslating = autoTranslatingFieldKey === `${key}:${loc.locale}`;
          return (
            <InlineStack key={loc.locale} gap="100" blockAlign="center" wrap={false}>
              <span style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                <LocaleFlag locale={loc.locale} title={loc.name} size={20} round />
              </span>
              <div style={{ flex: 1 }}>
                <TextField
                  label="" labelHidden
                  multiline={multiline ? 2 : undefined}
                  placeholder={placeholderValue}
                  value={translationDrafts[dk] ?? existing}
                  onChange={(val) => setTranslationDrafts((prev) => ({ ...prev, [dk]: val }))}
                  onBlur={() => saveProductTranslation(loc.locale, key)}
                  autoComplete="off"
                />
              </div>
              <Button
                icon={GlobeIcon}
                size="slim"
                loading={isAutoTranslating}
                disabled={!hasContent || isAutoTranslating}
                accessibilityLabel={`Automatisch übersetzen (${loc.name})`}
                onClick={() => handleAutoTranslateField(key, loc.locale)}
              />
            </InlineStack>
          );
        })}
      </BlockStack>
    );
  };

  // ── Basis-State ──
  //const [selectedImage, setSelectedImage] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [selectedDetailTab, setSelectedDetailTab] = useState(0);

  const images = product.images?.edges?.map(e => e.node) ?? [];

  const mediaMap = {};
  product.media?.edges?.forEach(e => {
    const mediaId = e.node.id;           // gid://shopify/MediaImage/...
    const imageUrl = e.node.image?.url;  // ← URL statt ID
    if (imageUrl) mediaMap[imageUrl] = mediaId;
  });

  const initialImages = images.map(img => ({
    ...img,
    mediaId: mediaMap[img.url] ?? null,  // ← img.url statt img.id
  }));

  const imageUpload = useImageUpload({
    productId: product.id,
    initialImages,
    setLocalProducts: () => {},
    setToast,
    onImageDelete: (img) => {
      // Varianten die dieses Bild haben → image auf null setzen
      setLocalVariants(prev => prev.map(v =>
        v.image?.url === img.url
          ? { ...v, image: null, mediaId: null }
          : v
      ));
    },
  });

  const metafields = product.metafields?.edges?.map(e => e.node) ?? [];
  // interne/versteckte Felder (z.B. Reihenfolge-Speicher) zählen nicht als sichtbares Metafield
  const visibleMetafieldsCount = metafields.filter(f => f.namespace !== "rexpaw").length;


  // ── Varianten (lokaler State für optimistic UI) ──
  const [localVariants, setLocalVariants] = useState(
    product.variants?.edges?.map(e => e.node) ?? []
  );

  const defaultVariant = localVariants.length === 1 && localVariants[0]?.title === "Default Title" ? localVariants[0] : null;

  const {
    variantDraft, setVariantDraft,
    editingVariantId, setEditingVariantId,
    openVariantEdit, handleVariantSave,
    isSaving,
  } = useVariantEdit({ fetcher, productId: product.id, locationId, setLocalVariants });

  const {
    optionDrafts,
    setOptionDrafts,
    optionsDirty,
    handleOptionsSave,
  } = useProductOptions({ product, fetcher, setLocalVariants, abbreviationsMap, shopAbbreviations: skuAbbreviations ?? {} });

  const hasVariants = localVariants.length > 1 || localVariants[0]?.title !== "Default Title";
  const totalVariants = localVariants.length > 1 ? `${localVariants.length}` : "";
  const totalStock = localVariants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
  const hasZeroStock = localVariants.some(v => (v.inventoryQuantity ?? 0) === 0);

  const variantStockRows = localVariants.map((variant) => {
    const stock = Number(variant.inventoryQuantity) || 0;
    const stockState = getVariantStockState(stock);
    return {
      ...variant,
      stock,
      stockState,
      isSale: variant.compareAtPrice && parseFloat(variant.compareAtPrice) > parseFloat(variant.price),
    };
  });
  const isStatusSaving = fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateStatus";

  const handleStatusToggle = () => {
    const newStatus = product.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    fetcher.submit({ action: "updateStatus", id: product.id, status: newStatus }, { method: "POST" });
  };

  const onVariantImageAssign = (variantId, mediaId, currentMediaId = null) => {

    // Optimistic UI
    setLocalVariants((prev) =>
      prev.map((variant) => {
        if (variant.id !== variantId) return variant;

        const selectedImage =
          imageUpload.localImages.find(
            (img) => img.mediaId === mediaId
          ) ?? null;

        if (!mediaId) {
          return {
            ...variant,
            mediaId: null,
            image: null,
          };
        }

        return {
          ...variant,
          mediaId,
          image: selectedImage
            ? {
                id: selectedImage.id,
                url: selectedImage.url,
                altText: selectedImage.altText,
              }
            : null,
        };
      })
    );

    fetcher.submit(
      {
        action: "assignVariantImage",
        variantId,
        mediaId,
        currentMediaId,
        productId: product.id,
      },
      { method: "POST" }
    );
  };

  const detailTabs = [
    { id: "variants", content: `Varianten${variantStockRows.length ? ` (${variantStockRows.length})` : ""}` },
    //{ id: "shipping", content: "Shipping" },
    { id: "metafields", content: `Metafields${visibleMetafieldsCount ? ` (${visibleMetafieldsCount})` : ""}` },
  ];


  // ── Effekte: fetcher responses ──

  useEffect(() => {

    if (!fetcher.data) return;

    if (fetcher.data.type === "delete") {
      setToast(`${titleValue} *** KOPIE *** erstellt 🎉`);
      navigate(returnTo);
      return;
    }

    if (fetcher.data.type === "duplicate") {
      setToast("Produkt dupliziert ✅");
      if (fetcher.data.newId) {
        navigate(`/app/products/${fetcher.data.newId}${location.search}`);
      }
      return;
    }

    if (!fetcher.data?.product) return;
    const next = fetcher.data.product;

    if (
      fetcher.data.type === "updateOptions" ||
      fetcher.data.type === "update"
    ) {

    const nextVariants =
      next.variants?.edges?.map((e) => {
        const node = e.node;

        const matchedImage = imageUpload.localImages.find(
          (img) => img.url === node.image?.url
        );

        return {
          ...node,
          mediaId: matchedImage?.mediaId ?? null,
        };
      }) ?? [];

      setLocalVariants(nextVariants);

      if (
        fetcher.data.type === "updateOptions" ||
        fetcher.data.type === "update"
      ) {
        setOptionDrafts(normalizeOptions(next.options ?? []));
        setToast?.("Optionen gespeichert");
      }
    }
  }, [fetcher.data, setOptionDrafts]);

  // Bilder aus Loader initialisieren
  useEffect(() => {
    const imgs = (product.images?.edges?.map(e => e.node) ?? []).map((img) => ({
      ...img,
      mediaId: mediaMap[img.url] ?? null,
    }));

    imageUpload.setLocalImages(imgs);
  }, []);

  // Toast wieder ausblenden
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Handler ──
  const handleDelete = () => {
    fetcher.submit({ action: "delete", id: product.id }, { method: "POST" });
    setDeleteModalOpen(false);
    navigate(returnTo);
  };

  // ── Seite ──

  return (
    <AppLayout>
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => navigate(returnTo)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <Icon source={ArrowLeftIcon} />
          </button>
          <Text variant="headingLg" as="h1">{titleValue}</Text>
          {translatedLocalesForFields("title").map((loc) => (
            <span key={loc.locale} title={`Übersetzung vorhanden (${loc.name})`}>
              <LocaleFlag locale={loc.locale} round size={12} />
            </span>
          ))}
          {translationLocales.length > 0 && (
            <button
              onClick={() => setTitleEditOpen((v) => !v)}
              title="Titel bearbeiten"
              style={{
                background: titleEditOpen ? "var(--p-color-bg-surface-selected)" : "transparent",
                border: "1px solid var(--p-color-border)",
                borderRadius: 4, cursor: "pointer",
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                flexShrink: 0,
              }}
            >
              <Icon source={EditIcon} tone="subdued" />
            </button>
          )}
          <Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            disabled={product.status !== "ACTIVE"}
            onClick={() => {
              const a = document.createElement("a");
              a.href = product.onlineStorePreviewUrl;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.click();
            }}
          >
            Im Shop ansehen
          </Button>
          <Button
            onClick={() => {
              fetcher.submit(
                { action: "duplicate", id: product.id, title: titleValue },
                { method: "post" }
              );
              setToast(`${titleValue} wird kopiert…`);
            }}
          >
            Duplizieren
          </Button>
          <Button tone="critical" onClick={() => setDeleteModalOpen(true)}>Löschen</Button>
          {translationLocales.length > 0 && (
            <Button icon={GlobeIcon} pressed={showTitleTranslation} onClick={() => setShowTitleTranslation((v) => !v)}>
              Übersetzen
            </Button>
          )}
          <Button variant="primary" loading={isStatusSaving} onClick={handleStatusToggle}>
            {product.status === "ACTIVE" ? "Auf Entwurf setzen" : "Aktivieren"}
          </Button>
        </div>
      </div>

      {translationLocales.length > 0 && showTitleTranslation && (
        <div style={{ marginBottom: 16 }}>
          <InlineStack align="end" blockAlign="center">
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: isDark ? "#9ca3af" : "#6b7280" }}>Automatisch übersetzen:</span>
              {translationLocales.map((loc) => (
                <button
                  key={loc.locale}
                  onClick={() => handleAutoTranslateProduct(loc.locale)}
                  disabled={autoTranslatingLocale === loc.locale}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 12px", borderRadius: 999, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`,
                    background: isDark ? "#2c2c2c" : "#fff", fontSize: 12, fontWeight: 500,
                    color: isDark ? "#e5e7eb" : "#374151",
                    cursor: autoTranslatingLocale === loc.locale ? "not-allowed" : "pointer",
                    opacity: autoTranslatingLocale === loc.locale ? 0.6 : 1,
                  }}
                >
                  {autoTranslatingLocale === loc.locale ? (
                    "Übersetze…"
                  ) : (
                    <>
                      <LocaleFlag locale={loc.locale} title={loc.name} round /> {loc.name}
                    </>
                  )}
                </button>
              ))}
            </div>
          </InlineStack>
        </div>
      )}

      {translationLocales.length > 0 && titleEditOpen && (
        <div style={{ marginBottom: 16 }}>
          <Card>
              <BlockStack gap="150">
                <InlineStack gap="100" blockAlign="start" wrap={false}>
                  {primaryLocale && (
                    <div style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "flex-start", paddingTop: 6 }}>
                      <LocaleFlag locale={primaryLocale} size={20} round />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="" labelHidden
                      value={titleDraft}
                      onChange={setTitleDraft}
                      onBlur={saveTitle}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>
                {renderProductTranslationRows("title")}
              </BlockStack>
            </Card>
        </div>
      )}

      <Layout>

        {/* ── Linke Spalte ── */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">

            {/* Bilder */}
            <Card>
              <ImagesSection
                localImages={imageUpload.localImages}
                setLocalImages={imageUpload.setLocalImages}
                uploadingImage={imageUpload.uploadingImage}
                uploadProgress={imageUpload.uploadProgress}
                uploadError={imageUpload.uploadError}
                setUploadError={imageUpload.setUploadError}
                fileInputRef={imageUpload.fileInputRef}
                handleImagesUpload={imageUpload.handleImagesUpload}
                reorderImages={imageUpload.reorderImages}
                deleteImage={imageUpload.deleteImage}
              />
            </Card>

            {/* Produktinfos */}
            <ProductDetailInfos
              product={product}
              fetcher={fetcher}
              formatDate={formatDate}
              totalStock={totalStock}
              hasZeroStock={hasZeroStock}
              allVendors={allVendors}
              allProductTypes={allProductTypes}
            />

          </BlockStack>
        </Layout.Section>

        {/* ── Rechte Spalte ── */}
        <Layout.Section>
          <BlockStack gap="400">

            {/* ── Beschreibung (editierbar) ── */}
            <ProductDetailDescription
              product={product}
              fetcher={fetcher}
              productId={product.id}
              setToast={setToast}
              renderTranslationRows={renderProductTranslationRows}
              primaryLocale={primaryLocale}
              translatedLocales={translatedLocalesForFields("body_html")}
            />

            {/* ── SEO ── */}
            <ProductDetailSeo
              product={product}
              renderTranslationRows={renderProductTranslationRows}
              fetcher={fetcher}
              shop={shop}
              setToast={setToast}
              primaryLocale={primaryLocale}
              translatedLocales={translatedLocalesForFields("meta_title", "meta_description", "handle")}
            />

            {/* ── Organization Collections / Tags ── */}
            <ProductDetailOrganisation
              product={product}
              allCollections={allCollections}
              allTags={allTags}
              fetcher={fetcher}
              setToast={setToast}
              locales={locales}
            />

            {/* ── TABS ── */}
            <ProductDetailTabs
              selectedDetailTab={selectedDetailTab}
              setSelectedDetailTab={setSelectedDetailTab}
              detailTabs={detailTabs}
              localImages={imageUpload.localImages}
              onVariantImageAssign={onVariantImageAssign}
              setLocalImages={imageUpload.setLocalImages}
              optionDrafts={optionDrafts}
              setOptionDrafts={setOptionDrafts}
              optionsDirty={optionsDirty}
              handleOptionsSave={handleOptionsSave}
              hasVariants={hasVariants}
              totalVariants={totalVariants}
              localVariants={localVariants}
              defaultVariant={defaultVariant}
              variantDraft={variantDraft}
              setVariantDraft={setVariantDraft}
              editingVariantId={editingVariantId}
              setEditingVariantId={setEditingVariantId}
              openVariantEdit={openVariantEdit}
              handleVariantSave={handleVariantSave}
              isSaving={isSaving}
              metafields={metafields}
              allMetafieldDefinitions={allMetafieldDefinitions}
              defaultMetafieldOrder={defaultMetafieldOrder}
              locales={locales}
              shopId={shopId}
              fieldLabels={fieldLabels}
              optionSwatches={optionSwatches}
              product={product}
              fetcher={fetcher}
              setToast={setToast}
              skuFormat={skuFormat}
            />

          </BlockStack>
        </Layout.Section>

        {/* ── Delete Modal ── */}
        <Modal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Produkt löschen"
          primaryAction={{ content: "Löschen", destructive: true, onAction: handleDelete }}
          secondaryActions={[{ content: "Abbrechen", onAction: () => setDeleteModalOpen(false) }]}
        >
          <Modal.Section>
            <Text>Wirklich löschen: <strong>{titleValue}</strong>? Diese Aktion kann nicht rückgängig gemacht werden.</Text>
          </Modal.Section>
        </Modal>

        {/* ── Übersetzung überschreiben Modal ── */}
        <Modal
          open={!!pendingAutoTranslateLocale}
          onClose={() => setPendingAutoTranslateLocale(null)}
          title="Übersetzung überschreiben?"
          primaryAction={{
            content: "Überschreiben",
            destructive: true,
            onAction: () => {
              runAutoTranslateProduct(pendingAutoTranslateLocale);
              setPendingAutoTranslateLocale(null);
            },
          }}
          secondaryActions={[{ content: "Abbrechen", onAction: () => setPendingAutoTranslateLocale(null) }]}
        >
          <Modal.Section>
            <Text>
              Für diese Sprache gibt es bereits Übersetzungen (evtl. manuell angepasst). Automatisch
              übersetzen überschreibt Titel, Beschreibung, Meta-Titel, Meta-Beschreibung und URL-Handle
              mit einer frischen DeepL-Übersetzung. Fortfahren?
            </Text>
          </Modal.Section>
        </Modal>

        {toast && (
          <div style={{
            position: "fixed", bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#303030", color: "white",
            padding: "12px 16px", borderRadius: 8,
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}>
            {toast}
          </div>
        )}

      </Layout>

    </div>
    </AppLayout>
  );
}
