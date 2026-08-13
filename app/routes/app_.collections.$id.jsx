import { useLoaderData, useNavigation, useNavigate, useLocation, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState, useEffect, useRef, useMemo } from "react";
import { CollectionIcon, ArrowLeftIcon, ImageIcon, DeleteIcon } from "@shopify/polaris-icons";
import AppLayout from "../components/layout/AppLayout";
import { useColorScheme } from "../context/ColorSchemeContext";
import { translateText } from "../services/deepl.server";
import LocaleFlag from "../components/shared/LocaleFlag";
import { resizeImageFile } from "../utils/imageResize.js";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const gid = `gid://shopify/Collection/${params.id}`;

  const res = await admin.graphql(
    `#graphql
    query GetCollection($id: ID!) {
      collection(id: $id) {
        id title handle descriptionHtml updatedAt
        sortOrder
        seo { title description }
        productsCount { count }
        image { url altText }
        products(first: 250) {
          edges {
            node {
              id title status
              featuredImage { url altText }
              variants(first: 1) { edges { node { price } } }
              collections(first: 10) { edges { node { id title } } }
            }
          }
        }
      }
    }`,
    { variables: { id: gid } }
  );
  const data = await res.json();
  const collection = data.data.collection;
  if (!collection) throw new Response("Nicht gefunden", { status: 404 });
  const shop = new URL(request.url).searchParams.get("shop");

  // Aktive Shop-Sprachen (für Kollektions-Übersetzungen)
  let locales = [];
  try {
    const localesRes = await admin.graphql(`query { shopLocales { locale name primary published } }`);
    const localesJson = await localesRes.json();
    locales = (localesJson.data?.shopLocales ?? []).filter(l => l.published);
  } catch (e) { /* falls Scope fehlt: leer */ }

  return { collection, shop, locales };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const gid = `gid://shopify/Collection/${params.id}`;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update") {
    const title = formData.get("title");
    const descriptionHtml = formData.get("descriptionHtml");
    const handle = formData.get("handle") || undefined;
    const seoTitle = formData.get("seoTitle");
    const seoDescription = formData.get("seoDesc");
    const sortOrder = formData.get("sortOrder") || undefined;
    const imageUrl = formData.get("imageUrl") || null;
    const removeImage = formData.get("removeImage") === "1";

    const input = { id: gid, title, descriptionHtml, seo: { title: seoTitle, description: seoDescription } };
    if (handle) input.handle = handle;
    if (sortOrder) input.sortOrder = sortOrder;
    if (imageUrl) input.image = { src: imageUrl, altText: "" };
    else if (removeImage) input.image = null;

    const res = await admin.graphql(
      `#graphql
      mutation UpdateCollection($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id title handle descriptionHtml sortOrder seo { title description } image { url altText } }
          userErrors { field message }
        }
      }`,
      { variables: { input } }
    );
    const data = await res.json();
    const errors = data.data.collectionUpdate.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { success: true, intent: "update", collection: data.data.collectionUpdate.collection };
  }

  if (intent === "uploadImage") {
    const filename = formData.get("filename");
    const mimeType = formData.get("mimeType");
    const stageRes = await admin.graphql(
      `#graphql
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      { variables: { input: [{ filename, mimeType, httpMethod: "POST", resource: "IMAGE" }] } }
    );
    const stageData = await stageRes.json();
    const errors = stageData.data.stagedUploadsCreate.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { uploadTarget: stageData.data.stagedUploadsCreate.stagedTargets[0] };
  }

  if (intent === "removeProducts") {
    const { removeProductFromCollection } = await import("../services/product.server");
    const productIds = JSON.parse(formData.get("productIds"));
    await Promise.all(productIds.map(pid => removeProductFromCollection(admin, pid, gid)));
    return { success: true, intent: "removeProducts", removedIds: productIds };
  }

  if (intent === "searchProducts") {
    const query = formData.get("query") ?? "";
    const res = await admin.graphql(
      `#graphql
      query SearchProducts($query: String) {
        products(first: 20, query: $query) {
          edges { node { id title status featuredImage { url } variants(first: 1) { edges { node { price } } } collections(first: 5) { edges { node { id title } } } } }
        }
      }`,
      { variables: { query: query ? `title:*${query}*` : "" } }
    );
    const data = await res.json();
    return { intent: "searchProducts", products: data.data.products.edges.map(e => e.node) };
  }

  if (intent === "addProducts") {
    const { addProductToCollection } = await import("../services/product.server");
    const productIds = JSON.parse(formData.get("productIds"));
    await Promise.all(productIds.map(pid => addProductToCollection(admin, pid, gid)));
    const res = await admin.graphql(
      `#graphql
      query GetAddedProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { id title status featuredImage { url } variants(first: 1) { edges { node { price } } } }
        }
      }`,
      { variables: { ids: productIds } }
    );
    const data = await res.json();
    return { success: true, intent: "addProducts", addedProducts: data.data.nodes.filter(Boolean) };
  }

  // Übersetzbare Inhalte (Titel/Beschreibung) + Digest + bestehende Übersetzungen laden
  if (intent === "getTranslations") {
    const locales = JSON.parse(formData.get("locales") || "[]");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest locale }
        }
      }
    `, { variables: { id: gid } });
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
      `, { variables: { id: gid, locale } });
      const tJson = await tRes.json();
      translations[locale] = tJson.data?.translatableResource?.translations ?? [];
    }

    return { success: true, intent: "getTranslations", translatableContent, translations };
  }

  if (intent === "saveTranslation") {
    const locale = formData.get("locale");
    const key = formData.get("key");
    const value = formData.get("value");
    const digest = formData.get("digest");

    // Leeres Feld → Übersetzung löschen statt einen leeren Wert zu registrieren (v.a. bei
    // "handle" würde ein leerer Wert ohnehin von Shopify abgelehnt).
    if (!value?.trim()) {
      const res = await admin.graphql(`
        mutation($id: ID!, $translationKeys: [String!]!, $locales: [String!]!) {
          translationsRemove(resourceId: $id, translationKeys: $translationKeys, locales: $locales) {
            userErrors { field message }
          }
        }
      `, { variables: { id: gid, translationKeys: [key], locales: [locale] } });
      const data = await res.json();
      const errors = data.data?.translationsRemove?.userErrors ?? [];
      if (errors.length) return { error: errors[0].message };
      return { success: true, intent: "saveTranslation", locale, key, value: "" };
    }

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, {
      variables: {
        id: gid,
        translations: [{ locale, key, value, translatableContentDigest: digest }],
      },
    });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { error: errors[0].message };
    return { success: true, intent: "saveTranslation", locale, key, value };
  }

  // Alle übersetzbaren Felder (Titel/Beschreibung/Meta-Titel/Meta-Beschreibung) auf einmal
  // per DeepL übersetzen und direkt speichern.
  if (intent === "autoTranslateAll") {
    const locale = formData.get("locale");
    const sourceLocale = formData.get("sourceLocale");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest }
        }
      }
    `, { variables: { id: gid } });
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
      return { error: e.message };
    }

    // URL-Handle nicht per DeepL übersetzen, sondern aus dem übersetzten Titel ableiten (slugifiziert)
    const handleContent = translatableContent.find((c) => c.key === "handle");
    const translatedTitle = translations.find((t) => t.key === "title")?.value;
    if (handleContent?.digest && translatedTitle) {
      const slug = translatedTitle
        .trim().toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      // Wenn der übersetzte Titel (z.B. weil DeepL ihn unverändert lässt) denselben Slug ergibt
      // wie das deutsche Original, würde Shopify beim Speichern einen Duplikat-Suffix ("-1")
      // anhängen, weil der Handle shopweit eindeutig sein muss — auch gegenüber der eigenen
      // Primärsprache. In dem Fall lieber keine eigene Übersetzung setzen (Shop fällt automatisch
      // auf den Original-Handle zurück) statt einen falschen "-1"-Handle zu erzeugen.
      if (slug && slug !== handleContent.value) {
        translations.push({ locale, key: "handle", value: slug, translatableContentDigest: handleContent.digest });
      }
    }

    if (translations.length === 0) return { error: "Nichts zu übersetzen (Original leer)" };

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, { variables: { id: gid, translations } });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { error: errors[0].message };

    return { success: true, intent: "autoTranslateAll", locale, translations };
  }

  return { error: "Unbekannte Aktion" };
};

// ── Konstanten ────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "MANUAL",       label: "Manuell" },
  { value: "BEST_SELLING", label: "Meistverkauft" },
  { value: "ALPHA_ASC",    label: "A–Z" },
  { value: "ALPHA_DESC",   label: "Z–A" },
  { value: "PRICE_ASC",    label: "Preis aufsteigend" },
  { value: "PRICE_DESC",   label: "Preis absteigend" },
  { value: "CREATED",      label: "Älteste zuerst" },
  { value: "CREATED_DESC", label: "Neueste zuerst" },
];

const STATUS_LABEL = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
const STATUS_COLOR = (isDark) => ({
  ACTIVE:   isDark ? "#6ee7a8" : "#16a34a",
  DRAFT:    isDark ? "#7eb8e8" : "#6b7280",
  ARCHIVED: isDark ? "#e8c97d" : "#d97706",
});
const STATUS_BG = (isDark) => ({
  ACTIVE:   isDark ? "#1a3a2a" : "#dcfce7",
  DRAFT:    isDark ? "#1e2d3d" : "#f3f4f6",
  ARCHIVED: isDark ? "#332b1a" : "#fef3c7",
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionDetail() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { collection, shop, locales } = useLoaderData();
  const collectionGid = collection.id;
  const navigate = useNavigate();
  const location = useLocation();
  const saveFetcher  = useFetcher();
  const stageFetcher = useFetcher();
  const removeFetcher = useFetcher();
  const searchFetcher = useFetcher();
  const addFetcher   = useFetcher();
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

  const translationLocales = locales.filter((l) => !l.primary);
  const primaryLocale = locales.find((l) => l.primary)?.locale;
  const [translationData, setTranslationData] = useState(null); // { translatableContent, translations }
  const [translationDrafts, setTranslationDrafts] = useState({});
  const [autoTranslatingLocale, setAutoTranslatingLocale] = useState(null);

  const isSaving = saveFetcher.state !== "idle";

  // Felder
  const [title, setTitle]               = useState(collection.title);
  const [descriptionHtml, setDesc]      = useState(collection.descriptionHtml ?? "");
  const [handle, setHandle]             = useState(collection.handle ?? "");
  const [seoTitle, setSeoTitle]         = useState(collection.seo?.title ?? "");
  const [seoDesc, setSeoDesc]           = useState(collection.seo?.description ?? "");
  const [sortOrder, setSortOrder]       = useState(collection.sortOrder ?? "MANUAL");

  // Saved-Baseline für isDirty
  const [saved, setSaved] = useState({ title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder });
  const isDirty = title !== saved.title || descriptionHtml !== saved.descriptionHtml ||
    handle !== saved.handle || seoTitle !== saved.seoTitle ||
    seoDesc !== saved.seoDesc || sortOrder !== saved.sortOrder;

  const [titleEditing, setTitleEditing] = useState(false);
  const [descEditing, setDescEditing] = useState(false);
  const [seoEditing, setSeoEditing] = useState(false);
  const [imageUrl, setImageUrl]         = useState(collection.image?.url ?? null);
  const [toast, setToast]               = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);
  const pendingFile  = useRef(null);

  // Produktliste
  const initialProducts = collection.products?.edges?.map(e => e.node) ?? [];
  const [products, setProducts]   = useState(initialProducts);
  const totalCount  = collection.productsCount?.count ?? 0;
  const isTruncated = totalCount > initialProducts.length;
  const [selectedIds, setSelectedIds] = useState([]);

  // Tabellen-Sortierung
  const [sortCol, setSortCol]   = useState(null); // "title" | "price" | "status"
  const [sortDir, setSortDir]   = useState("asc");

  const sortedProducts = useMemo(() => {
    if (!sortCol) return products;
    return [...products].sort((a, b) => {
      let va, vb;
      if (sortCol === "title")  { va = a.title; vb = b.title; }
      if (sortCol === "price")  { va = parseFloat(a.variants?.edges?.[0]?.node?.price ?? 0); vb = parseFloat(b.variants?.edges?.[0]?.node?.price ?? 0); }
      if (sortCol === "status") { va = a.status; vb = b.status; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [products, sortCol, sortDir]);

  const handleColSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const sortIndicator = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // Modal
  const [modalOpen, setModalOpen]       = useState(false);
  const [modalSearch, setModalSearch]   = useState("");
  const [modalSelected, setModalSelected] = useState([]);
  const searchTimer = useRef(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Übersetzungen beim Laden der Seite abrufen (nur eine Ressource, kein Lazy-Load nötig)
  useEffect(() => {
    if (translationLocales.length === 0) return;
    translationFetcher.submit(
      { intent: "getTranslations", locales: JSON.stringify(translationLocales.map((l) => l.locale)) },
      { method: "post" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (translationFetcher.state !== "idle" || translationFetcher.data?.intent !== "getTranslations") return;
    const d = translationFetcher.data;
    setTranslationData({ translatableContent: d.translatableContent, translations: d.translations });
  }, [translationFetcher.state, translationFetcher.data]);


  useEffect(() => {
    if (autoTranslateFetcher.state !== "idle" || autoTranslateFetcher.data?.intent !== "autoTranslateAll") return;
    const d = autoTranslateFetcher.data;
    setAutoTranslatingLocale(null);
    if (d.error) { setToast(`Fehler: ${d.error}`); return; }
    setTranslationData((prev) => {
      if (!prev) return prev;
      const nextTranslations = { ...prev.translations, [d.locale]: d.translations };
      return { ...prev, translations: nextTranslations };
    });
    // Lokale Entwürfe für die übersetzte Sprache verwerfen, damit die neuen Werte sichtbar werden
    setTranslationDrafts((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${d.locale}:`)) delete next[k];
      }
      return next;
    });
    setToast("Automatisch übersetzt");
  }, [autoTranslateFetcher.state, autoTranslateFetcher.data]);

  const handleAutoTranslate = (locale) => {
    setAutoTranslatingLocale(locale);
    autoTranslateFetcher.submit(
      { intent: "autoTranslateAll", locale, sourceLocale: primaryLocale ?? "de" },
      { method: "post" }
    );
  };

  const translationDraftKey = (locale, key) => `${locale}:${key}`;

  // Welche Sprachen für ein oder mehrere Felder bereits eine Übersetzung haben — für die
  // Flaggen-Anzeige im Card-Header (zeigt die übersetzten Sprachen, nicht Deutsch).
  const translatedLocalesForFields = (...keys) => translationLocales.filter((loc) =>
    keys.some((key) => translationData?.translations?.[loc.locale]?.some((t) => t.key === key && t.value?.trim()))
  );

  // Kompakte Übersetzungszeilen für ein Feld (title/body_html/meta_title/meta_description),
  // eine Zeile pro Sprache. Deaktiviert, solange das Original-Feld keinen Inhalt hat
  // (Shopify liefert dann keinen Digest, ohne den lässt sich nichts speichern).
  const renderTranslationRows = (key, { multiline, maxWidth, fallback, prefix } = {}) => {
    if (translationLocales.length === 0) return null;
    if (!translationData) return <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>Lade Übersetzungen…</div>;
    const originalContent = translationData.translatableContent?.find((c) => c.key === key);
    const hasContent = !!originalContent;
    const placeholderValue = hasContent ? originalContent.value : (fallback !== undefined ? fallback : "");
    return (
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {translationLocales.map((loc) => {
          const dk = translationDraftKey(loc.locale, key);
          const existing = translationData.translations?.[loc.locale]?.find((t) => t.key === key)?.value ?? "";
          const Field = multiline ? "textarea" : "input";
          return (
            <div key={loc.locale} style={{ display: "flex", alignItems: multiline ? "flex-start" : "center", gap: 8, width: "100%", maxWidth: maxWidth ? maxWidth + 30 : undefined }}>
              <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", marginTop: multiline ? 8 : 0 }}>
                <LocaleFlag locale={loc.locale} title={loc.name} round />
              </span>
              {prefix && <span style={{ fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap" }}>{prefix}</span>}
              <Field
                {...(multiline ? { rows: 2 } : {})}
                disabled={!hasContent}
                placeholder={placeholderValue}
                value={translationDrafts[dk] ?? existing}
                onChange={(e) => setTranslationDrafts((prev) => ({ ...prev, [dk]: e.target.value }))}
                onBlur={() => saveTranslation(loc.locale, key)}
                style={{
                  ...inputStyle(isDark), marginBottom: 0, flex: 1,
                  ...(multiline ? { resize: "vertical", fontFamily: "inherit" } : {}),
                  ...(hasContent ? {} : { opacity: 0.5, cursor: "not-allowed" }),
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const saveTranslation = (locale, key) => {
    const content = translationData?.translatableContent?.find((c) => c.key === key);
    if (!content) return;
    const dk = translationDraftKey(locale, key);
    const existing = translationData.translations?.[locale]?.find((t) => t.key === key)?.value ?? "";
    const value = translationDrafts[dk] ?? existing;
    const fetcherForKey = translationFetcherByKey[key];
    fetcherForKey.submit(
      { intent: "saveTranslation", locale, key, value, digest: content.digest },
      { method: "post" }
    );
  };

  // Response-Handling für alle 5 Feld-Fetcher (siehe translationFetcherByKey oben).
  useEffect(() => {
    for (const fetcherForKey of Object.values(translationFetcherByKey)) {
      if (fetcherForKey.state !== "idle" || fetcherForKey.data?.intent !== "saveTranslation") continue;
      const d = fetcherForKey.data;
      if (d.error) { setToast(`Fehler: ${d.error}`); continue; }
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

  // Save-Response
  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    const d = saveFetcher.data;
    if (d.success && d.intent === "update") {
      setToast("Gespeichert");
      if (d.collection?.image?.url) setImageUrl(d.collection.image.url);
      if (d.collection?.handle) setHandle(d.collection.handle);
      setSaved({ title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder });
      setTitleEditing(false); setDescEditing(false); setSeoEditing(false);
    } else if (d.error) {
      setToast(`Fehler: ${d.error}`);
    }
  }, [saveFetcher.state, saveFetcher.data]);

  // Stage → S3
  useEffect(() => {
    if (stageFetcher.state !== "idle" || !stageFetcher.data?.uploadTarget) return;
    const { url, resourceUrl, parameters } = stageFetcher.data.uploadTarget;
    const file = pendingFile.current;
    if (!file) return;
    const fd = new FormData();
    parameters.forEach(({ name, value }) => fd.append(name, value));
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = ev => { if (ev.lengthComputable) setUploadProgress(Math.round(ev.loaded / ev.total * 100)); };
    xhr.onload = () => {
      setUploadProgress(null); pendingFile.current = null;
      if (xhr.status < 300) {
        saveFetcher.submit({ intent: "update", title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder, imageUrl: resourceUrl }, { method: "post" });
        setToast("Bild hochgeladen");
      } else setToast(`Upload fehlgeschlagen (${xhr.status})`);
    };
    xhr.onerror = () => { setUploadProgress(null); setToast("Upload fehlgeschlagen"); };
    xhr.open("POST", url); xhr.send(fd);
  }, [stageFetcher.state, stageFetcher.data]);

  // Remove-Response
  useEffect(() => {
    if (removeFetcher.state !== "idle" || !removeFetcher.data?.success) return;
    const removed = removeFetcher.data.removedIds;
    setProducts(prev => prev.filter(p => !removed.includes(p.id)));
    setSelectedIds([]);
    setToast(`${removed.length} Produkt${removed.length > 1 ? "e" : ""} entfernt`);
  }, [removeFetcher.state, removeFetcher.data]);

  // Add-Response
  useEffect(() => {
    if (addFetcher.state !== "idle" || !addFetcher.data?.success) return;
    const added = addFetcher.data.addedProducts ?? [];
    setProducts(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      return [...prev, ...added.filter(p => !existingIds.has(p.id))];
    });
    setModalOpen(false); setModalSearch(""); setModalSelected([]);
    setToast(`${added.length} Produkt${added.length !== 1 ? "e" : ""} hinzugefügt`);
  }, [addFetcher.state, addFetcher.data]);

  const openModal = () => {
    setModalOpen(true); setModalSearch(""); setModalSelected([]);
    searchFetcher.submit({ intent: "searchProducts", query: "" }, { method: "post" });
  };
  const handleModalSearch = (val) => {
    setModalSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchFetcher.submit({ intent: "searchProducts", query: val }, { method: "post" });
    }, 300);
  };
  const toggleModalSelect = (id) => setModalSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const handleAddConfirm = () => {
    if (!modalSelected.length) return;
    addFetcher.submit({ intent: "addProducts", productIds: JSON.stringify(modalSelected) }, { method: "post" });
  };

  const backUrl  = location.state?.from ?? "/app/collections";
  const handleSave = () => saveFetcher.submit({ intent: "update", title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder }, { method: "post" });
  const handleRemoveImage = () => {
    setImageUrl(null);
    saveFetcher.submit({ intent: "update", title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder, removeImage: "1" }, { method: "post" });
    setToast("Bild entfernt");
  };
  const startUpload = async (file) => {
    if (!file || !file.type?.startsWith("image/")) return;
    setUploadProgress(0);
    const resized = await resizeImageFile(file);
    pendingFile.current = resized;
    stageFetcher.submit({ intent: "uploadImage", filename: resized.name, mimeType: resized.type }, { method: "post" });
  };
  const handleFileChange = (e) => startUpload(e.target.files?.[0]);
  const handleImageDrop = (e) => {
    e.preventDefault();
    startUpload(e.dataTransfer.files?.[0]);
  };
  const handleImageDragOver = (e) => e.preventDefault();

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(selectedIds.length === products.length ? [] : products.map(p => p.id));

  const openProduct = (productId) => {
    const numId = productId.split("/").pop();
    navigate(`/app/products/${numId}${location.search}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate(backUrl)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", color: isDark ? "#b0b7c3" : "#555", fill: isDark ? "#b0b7c3" : "#555" }}>
          <ArrowLeftIcon width={20} height={20} />
        </button>
        <span style={{ display: "flex", fill: isDark ? "#b0b7c3" : "#555" }}>
          <CollectionIcon width={22} height={22} />
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{collection.title}</h1>
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} disabled={isSaving || !isDirty} style={{
          padding: "8px 20px", borderRadius: 8, border: "none",
          background: isSaving || !isDirty ? (isDark ? "#3a3a3a" : "#ccc") : "#303030", color: isSaving || !isDirty ? (isDark ? "#666" : "#fff") : "#fff",
          fontSize: 14, fontWeight: 500, cursor: isSaving || !isDirty ? "not-allowed" : "pointer",
        }}>
          {isSaving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "stretch", marginBottom: 24 }}>
        {/* Linke Spalte — Bild, Sortierung, Infos */}
        <div style={{ width: "33%", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...cardStyle(isDark), flex: 1, display: "flex", flexDirection: "column" }}>
            <label style={labelStyle(isDark)}>Bild</label>
            {imageUrl ? (
              <div
                onDrop={handleImageDrop}
                onDragOver={handleImageDragOver}
                style={{ position: "relative", borderRadius: 8, overflow: "hidden", marginBottom: 10, flex: 1, minHeight: 120, maxHeight: 400 }}
              >
                <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", display: "block", borderRadius: 8, objectFit: "cover" }} />
                {uploadProgress !== null && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ color: "#fff", fontWeight: 600 }}>{uploadProgress}%</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
                  title="Bild entfernen"
                  style={{
                    position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%",
                    border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1,
                  }}
                >✕</button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleImageDrop}
                onDragOver={handleImageDragOver}
                style={{
                flex: 1, minHeight: 120, borderRadius: 8, border: `2px dashed ${isDark ? "#4a4a4a" : "#d1d5db"}`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: isDark ? "#b0b7c3" : "#9ca3af", gap: 8, marginBottom: 10,
              }}>
                {uploadProgress !== null
                  ? <div style={{ fontWeight: 600, color: "#303030" }}>{uploadProgress}%</div>
                  : <><span style={{ display: "flex", fill: isDark ? "#b0b7c3" : "#9ca3af" }}><ImageIcon width={28} height={28} /></span><span style={{ fontSize: 13 }}>Bild hochladen</span></>}
              </div>
            )}
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{
              width: "100%", padding: "7px 0", borderRadius: 7, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`,
              background: isDark ? "#2c2c2c" : "#f9fafb", fontSize: 13, cursor: "pointer", color: isDark ? "#e5e7eb" : "#374151",
            }}>
              {imageUrl ? "Bild ändern" : "Bild auswählen"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
          </div>

          <div style={cardStyle(isDark)}>
            <label style={labelStyle(isDark)}>Sortierung der Produkte</label>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ ...inputStyle(isDark), cursor: "pointer" }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ ...cardStyle(isDark), fontSize: 13, color: isDark ? "#9ca3af" : "#6b7280" }}>
            <div><strong>Geändert:</strong> {new Date(collection.updatedAt).toLocaleDateString("de-DE")}</div>
          </div>
        </div>

        {/* Rechte Spalte — Titel, Beschreibung, SEO */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {(titleEditing || descEditing || seoEditing) && translationLocales.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>Automatisch übersetzen:</span>
              {translationLocales.map((loc) => (
                <button
                  key={loc.locale}
                  onClick={() => handleAutoTranslate(loc.locale)}
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
          )}

          {/* Titel */}
          <div style={cardStyle(isDark)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: titleEditing ? 10 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ ...labelStyle(isDark), margin: 0 }}>Titel</label>
                {translatedLocalesForFields("title").map((loc) => (
                  <span key={loc.locale} title={`Übersetzung vorhanden (${loc.name})`}>
                    <LocaleFlag locale={loc.locale} round size={12} />
                  </span>
                ))}
              </div>
              {!titleEditing && (
                <button onClick={() => setTitleEditing(true)} style={editBtnStyle(isDark)}>Bearbeiten</button>
              )}
            </div>
            {titleEditing ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 320 }}>
                  {primaryLocale && (
                    <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      <LocaleFlag locale={primaryLocale} round />
                    </span>
                  )}
                  <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...inputStyle(isDark), maxWidth: 320, flex: 1 }} />
                </div>
                {renderTranslationRows("title", { maxWidth: 320, fallback: title })}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                  <button onClick={() => { setTitle(saved.title); setTitleEditing(false); }} style={cancelBtnStyle(isDark)}>Abbrechen</button>
                  <button onClick={handleSave} disabled={isSaving || !isDirty} style={saveBtnStyle(isDark, isSaving || !isDirty)}>
                    {isSaving ? "Speichern…" : "Speichern"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
            )}
          </div>

          {/* Beschreibung */}
          <div style={cardStyle(isDark)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: descEditing ? 10 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ ...labelStyle(isDark), margin: 0 }}>Beschreibung</label>
                {translatedLocalesForFields("body_html").map((loc) => (
                  <span key={loc.locale} title={`Übersetzung vorhanden (${loc.name})`}>
                    <LocaleFlag locale={loc.locale} round size={12} />
                  </span>
                ))}
              </div>
              {!descEditing && (
                <button onClick={() => setDescEditing(true)} style={editBtnStyle(isDark)}>Bearbeiten</button>
              )}
            </div>
            {descEditing ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  {primaryLocale && (
                    <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", marginTop: 8 }}>
                      <LocaleFlag locale={primaryLocale} round />
                    </span>
                  )}
                  <textarea value={descriptionHtml} onChange={e => setDesc(e.target.value)} rows={5}
                    style={{ ...inputStyle(isDark), resize: "vertical", fontFamily: "inherit", flex: 1 }}
                    placeholder="Beschreibung der Kollektion…" />
                </div>
                {renderTranslationRows("body_html", { multiline: true, fallback: descriptionHtml })}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                  <button onClick={() => { setDesc(saved.descriptionHtml); setDescEditing(false); }} style={cancelBtnStyle(isDark)}>Abbrechen</button>
                  <button onClick={handleSave} disabled={isSaving || !isDirty} style={saveBtnStyle(isDark, isSaving || !isDirty)}>
                    {isSaving ? "Speichern…" : "Speichern"}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: isDark ? "#9ca3af" : "#6b7280", lineHeight: 1.4 }}>
                {descriptionHtml ? descriptionHtml.replace(/<[^>]+>/g, "").slice(0, 220) : "Keine Beschreibung hinterlegt."}
              </div>
            )}
          </div>

          {/* SEO */}
          <div style={cardStyle(isDark)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: seoEditing ? 14 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ ...labelStyle(isDark), margin: 0 }}>SEO</label>
                {translatedLocalesForFields("meta_title", "meta_description", "handle").map((loc) => (
                  <span key={loc.locale} title={`Übersetzung vorhanden (${loc.name})`}>
                    <LocaleFlag locale={loc.locale} round size={12} />
                  </span>
                ))}
              </div>
              {!seoEditing && (
                <button onClick={() => setSeoEditing(true)} style={editBtnStyle(isDark)}>Bearbeiten</button>
              )}
            </div>

            {seoEditing && (
              <>
                <div style={fieldBox(isDark)}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={fieldBoxLabelStyle(isDark)}>SEO Titel · Empfohlen: bis 60 Zeichen</span>
                    <span style={fieldBoxLabelStyle(isDark)}>{seoTitle.length}/70</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {primaryLocale && (
                      <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                        <LocaleFlag locale={primaryLocale} round />
                      </span>
                    )}
                    <input value={seoTitle} onChange={e => setSeoTitle(e.target.value.slice(0, 70))} style={{ ...inputStyle(isDark), marginBottom: 0, flex: 1 }} placeholder={title} />
                  </div>
                  {renderTranslationRows("meta_title", { fallback: seoTitle })}
                </div>

                <div style={fieldBox(isDark)}>
                  <div style={{ marginBottom: 8 }}>
                    <span style={fieldBoxLabelStyle(isDark)}>URL Handle · Nur Kleinbuchstaben, Zahlen und Bindestriche</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {primaryLocale && (
                      <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                        <LocaleFlag locale={primaryLocale} round />
                      </span>
                    )}
                    <span style={{ fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap" }}>/collections/</span>
                    <input value={handle} onChange={e => setHandle(e.target.value)} style={{ ...inputStyle(isDark), marginBottom: 0, flex: 1 }} />
                  </div>
                  {renderTranslationRows("handle", { fallback: "", prefix: "/collections/" })}
                </div>

                <div style={fieldBox(isDark)}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={fieldBoxLabelStyle(isDark)}>Meta Description · Empfohlen: bis 155 Zeichen</span>
                    <span style={fieldBoxLabelStyle(isDark)}>{seoDesc.length}/160</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    {primaryLocale && (
                      <span style={{ width: 22, flexShrink: 0, display: "flex", justifyContent: "center", marginTop: 8 }}>
                        <LocaleFlag locale={primaryLocale} round />
                      </span>
                    )}
                    <textarea value={seoDesc} onChange={e => setSeoDesc(e.target.value.slice(0, 160))} rows={3}
                      style={{ ...inputStyle(isDark), resize: "vertical", fontFamily: "inherit", marginBottom: 0, flex: 1 }}
                      placeholder="Beschreibung für Suchmaschinen…" />
                  </div>
                  {renderTranslationRows("meta_description", { multiline: true, fallback: seoDesc })}
                </div>
              </>
            )}

            {(seoTitle || seoDesc) && (
              <div style={{ marginTop: seoEditing ? 14 : 0, padding: "10px 12px", background: isDark ? "#252525" : "#f8fafc", borderRadius: 8, border: `1px solid ${isDark ? "#3a3a3a" : "#e2e8f0"}` }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Vorschau Suchergebnis</div>
                <div style={{ fontSize: 14, color: isDark ? "#93c5fd" : "#1a0dab", fontWeight: 500 }}>{seoTitle || title}</div>
                <div style={{ fontSize: 13, color: isDark ? "#9ca3af" : "#4d5156", marginTop: 2, lineHeight: 1.4 }}>{seoDesc || descriptionHtml.replace(/<[^>]+>/g, "")}</div>
              </div>
            )}

            {seoEditing && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button onClick={() => {
                  setHandle(saved.handle); setSeoTitle(saved.seoTitle); setSeoDesc(saved.seoDesc);
                  setSeoEditing(false);
                }} style={cancelBtnStyle(isDark)}>Abbrechen</button>
                <button onClick={handleSave} disabled={isSaving || !isDirty} style={saveBtnStyle(isDark, isSaving || !isDirty)}>
                  {isSaving ? "Speichern…" : "Speichern"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Produktliste */}
      <div style={cardStyle(isDark)}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 12 }}>
          <label style={{ ...labelStyle(isDark), margin: 0 }}>Produkte ({products.length})</label>
          <div style={{ flex: 1 }} />
          <button onClick={openModal} style={{
            padding: "5px 14px", borderRadius: 7, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`,
            background: isDark ? "#2c2c2c" : "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500, color: isDark ? "#e5e7eb" : "#374151",
          }}>+ Produkte hinzufügen</button>
          {selectedIds.length > 0 && (
            <>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{selectedIds.length} ausgewählt</span>
              <button onClick={() => removeFetcher.submit({ intent: "removeProducts", productIds: JSON.stringify(selectedIds) }, { method: "post" })}
                disabled={removeFetcher.state !== "idle"}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                <DeleteIcon width={14} height={14} /> Aus Kollektion entfernen
              </button>
            </>
          )}
        </div>

        {products.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Keine Produkte in dieser Kollektion</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${isDark ? "#2e2e2e" : "#f0f0f0"}` }}>
                <th colSpan={2} style={{ ...thStyle, padding: "8px 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600 }}>
                    <input type="checkbox" checked={selectedIds.length === products.length && products.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} />
                    Alle Produkte auswählen
                  </label>
                </th>
                <th style={{ ...thStyle, textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleColSort("price")}>
                  Preis{sortIndicator("price")}
                </th>
                <th style={{ ...thStyle, textAlign: "center", cursor: "pointer", userSelect: "none" }} onClick={() => handleColSort("status")}>
                  Status{sortIndicator("status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(p => {
                const price = p.variants?.edges?.[0]?.node?.price;
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${isDark ? "#2a2a2a" : "#f5f5f5"}`, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = isDark ? "#252525" : "#fafafa"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={() => openProduct(p.id)}
                  >
                    <td style={{ padding: "10px 0", width: 20 }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {p.featuredImage?.url
                          ? <img src={p.featuredImage.url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: 4, background: isDark ? "#333" : "#e5e7eb", flexShrink: 0 }} />}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
                          {p.collections?.edges?.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {p.collections.edges.map(({ node: c }) => (
                                <span key={c.id} style={{
                                  fontSize: 11, padding: "1px 7px", borderRadius: 20,
                                  background: c.id === collectionGid ? (isDark ? "#1e3a5f" : "#dbeafe") : (isDark ? "#2a2a2a" : "#f3f4f6"),
                                  color: c.id === collectionGid ? (isDark ? "#93c5fd" : "#1d4ed8") : "#6b7280",
                                  fontWeight: c.id === collectionGid ? 600 : 400,
                                }}>{c.title}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 14, color: isDark ? "#b0b7c3" : "#374151" }}>
                      {price ? `€${parseFloat(price).toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: STATUS_BG(isDark)[p.status] ?? (isDark ? "#2a2a2a" : "#f3f4f6"), color: STATUS_COLOR(isDark)[p.status] ?? "#6b7280" }}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {isTruncated && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>
            Nur die ersten 250 von {totalCount} Produkten werden angezeigt.
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (() => {
        const alreadyIn = new Set(products.map(p => p.id));
        const results = (searchFetcher.data?.products ?? []).filter(p => !alreadyIn.has(p.id));
        const isSearching = searchFetcher.state !== "idle";
        const isAdding = addFetcher.state !== "idle";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: isDark ? "#1e1e1e" : "#fff", borderRadius: 14, width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.35)", border: isDark ? "1px solid #333" : "none" }}>
              <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${isDark ? "#2e2e2e" : "#f0f0f0"}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Produkte hinzufügen</div>
                <input autoFocus value={modalSearch} onChange={e => handleModalSearch(e.target.value)}
                  placeholder="Produkte suchen…"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {isSearching
                  ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Suche…</div>
                  : results.length === 0
                    ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                        {modalSearch ? "Keine Produkte gefunden" : "Alle Produkte bereits in dieser Kollektion"}
                      </div>
                    : results.map(p => {
                        const checked = modalSelected.includes(p.id);
                        const price = p.variants?.edges?.[0]?.node?.price;
                        return (
                          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #f5f5f5", cursor: "pointer", background: checked ? "#f0f9ff" : "transparent" }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleModalSelect(p.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                            {p.featuredImage?.url
                              ? <img src={p.featuredImage.url} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                              : <div style={{ width: 36, height: 36, borderRadius: 4, background: isDark ? "#333" : "#e5e7eb", flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>{price ? `€${parseFloat(price).toFixed(2)}` : "—"}</span>
                                {p.collections?.edges?.map(({ node: c }) => (
                                  <span key={c.id} style={{ fontSize: 11, padding: "1px 6px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280" }}>{c.title}</span>
                                ))}
                              </div>
                            </div>
                          </label>
                        );
                      })}
              </div>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${isDark ? "#2e2e2e" : "#f0f0f0"}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setModalOpen(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`, background: isDark ? "#2c2c2c" : "#fff", fontSize: 14, cursor: "pointer", color: isDark ? "#e5e7eb" : "#111" }}>Abbrechen</button>
                <button onClick={handleAddConfirm} disabled={!modalSelected.length || isAdding} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: !modalSelected.length || isAdding ? (isDark ? "#3a3a3a" : "#ccc") : "#303030",
                  color: !modalSelected.length || isAdding ? (isDark ? "#666" : "#fff") : "#fff", fontSize: 14, fontWeight: 500,
                  cursor: !modalSelected.length || isAdding ? "not-allowed" : "pointer",
                }}>
                  {isAdding ? "Hinzufügen…" : `${modalSelected.length > 0 ? `${modalSelected.length} ` : ""}Hinzufügen`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "calc(240px + (100vw - 240px) / 2)", transform: "translateX(-50%)", background: "#303030", color: "white", padding: "12px 16px", borderRadius: 8, zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
    </AppLayout>
  );
}

const cardStyle    = (isDark) => ({ background: isDark ? "#2f2f2f" : "#fff", borderRadius: 12, border: `1px solid ${isDark ? "#454545" : "#e3e3e3"}`, padding: "16px 18px" });
const fieldBox      = (isDark) => ({ border: `1px solid ${isDark ? "#4a4a4a" : "#e3e3e3"}`, borderRadius: 8, padding: 10, background: isDark ? "rgba(255,255,255,0.2)" : "#f6f6f7", marginBottom: 14 });
const fieldBoxLabelStyle = (isDark) => ({ fontSize: 12, color: isDark ? "#9ca3af" : "#6b7280" });
const editBtnStyle  = (isDark) => ({ padding: "5px 14px", borderRadius: 7, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`, background: isDark ? "#2c2c2c" : "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500, color: isDark ? "#e5e7eb" : "#374151" });
const cancelBtnStyle = (isDark) => ({ padding: "8px 16px", borderRadius: 8, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`, background: isDark ? "#2c2c2c" : "#fff", fontSize: 14, cursor: "pointer", color: isDark ? "#e5e7eb" : "#111" });
const saveBtnStyle  = (isDark, disabled) => ({ padding: "8px 20px", borderRadius: 8, border: "none", background: disabled ? (isDark ? "#3a3a3a" : "#ccc") : "#303030", color: disabled ? (isDark ? "#666" : "#fff") : "#fff", fontSize: 14, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer" });
const labelStyle   = (isDark) => ({ display: "block", fontSize: 13, fontWeight: 600, color: isDark ? "#e5e7eb" : "#374151", marginBottom: 8 });
const subLabelStyle = (isDark) => ({ display: "block", fontSize: 12, fontWeight: 600, color: isDark ? "#9ca3af" : "#6b7280", marginBottom: 6 });
const inputStyle   = (isDark) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`, fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit", marginBottom: 0, background: isDark ? "#2c2c2c" : "#fff", color: isDark ? "#e5e7eb" : "#111" });
const thStyle      = { padding: "8px 8px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" };
