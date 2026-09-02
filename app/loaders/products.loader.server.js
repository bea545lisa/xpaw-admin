const LIST_QUERY = `
  query($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          id title status handle onlineStorePreviewUrl
          createdAt updatedAt templateSuffix description tags
          seo { title description }
          featuredImage { url altText }
          collections(first: 10) {
            edges { node { id title } }
          }
          images(first: 5) {
            edges { node { id url altText } }
          }
          variants(first: 50) {
            edges {
              node {
                id title price compareAtPrice
                inventoryQuantity sku barcode
                image { id url altText }
                inventoryItem { id }
                selectedOptions { name value }
              }
            }
          }
          options {
            id name values
            optionValues { id name }
          }
          metafields(first: 20) {
            edges { node { id namespace key value } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function productsLoader({ request }, admin) {
  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");
  const shop = requestUrl.searchParams.get("shop");

  let allProducts = [];
  let cursor = null;
  let hasMore = true;
  let pageCount = 0;
  const MAX_PAGES = 20;

  while (hasMore && pageCount < MAX_PAGES) {
    pageCount++;
    const response = await admin.graphql(LIST_QUERY, { variables: { cursor } });
    const json = await response.json();
    const conn = json?.data?.products;
    if (!conn) break;
    allProducts = [...allProducts, ...conn.edges];
    hasMore = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }

  const locationRes = await admin.graphql(`
    query { locations(first: 1) { edges { node { id } } } }
  `);
  const locationJson = await locationRes.json();
  const locationId = locationJson?.data?.locations?.edges?.[0]?.node?.id;

  // Übersetzungsstatus pro Produkt & Sprache — Bulk-Query pro Sprache (mit Pagination) statt
  // pro Produkt, analog zur Kollektionsliste (siehe collections.loader.server.js).
  let locales = [];
  try {
    const localesRes = await admin.graphql(`query { shopLocales { locale name primary published } }`);
    const localesJson = await localesRes.json();
    locales = (localesJson.data?.shopLocales ?? []).filter((l) => l.published && !l.primary);
  } catch (e) { /* falls Scope fehlt: leer */ }

  // Für jedes Produkt & jede Sprache nicht nur "existiert Übersetzung" merken (Flaggen-Anzeige),
  // sondern auch die übersetzten Titel/Meta-Werte selbst — damit die Suche auch fremdsprachige
  // Titel/Meta-Titel/Meta-Beschreibungen findet, ohne pro Produkt nachzuladen.
  const translatedLocalesByProduct = {};
  const translatedContentByProduct = {};
  try {
    for (const loc of locales) {
      let tCursor = null;
      let tHasMore = true;
      while (tHasMore) {
        const tRes = await admin.graphql(`
          query($locale: String!, $cursor: String) {
            translatableResources(resourceType: PRODUCT, first: 250, after: $cursor) {
              nodes { resourceId translations(locale: $locale) { key value } }
              pageInfo { hasNextPage endCursor }
            }
          }
        `, { variables: { locale: loc.locale, cursor: tCursor } });
        const tJson = await tRes.json();
        const conn = tJson.data?.translatableResources;
        if (!conn) break;
        for (const node of conn.nodes) {
          const byKey = {};
          for (const t of node.translations ?? []) {
            if (["title", "meta_title", "meta_description"].includes(t.key) && t.value?.trim()) byKey[t.key] = t.value;
          }
          if (Object.keys(byKey).length === 0) continue;
          if (!translatedLocalesByProduct[node.resourceId]) translatedLocalesByProduct[node.resourceId] = [];
          translatedLocalesByProduct[node.resourceId].push(loc.locale);
          if (!translatedContentByProduct[node.resourceId]) translatedContentByProduct[node.resourceId] = {};
          translatedContentByProduct[node.resourceId][loc.locale] = byKey;
        }
        tHasMore = conn.pageInfo.hasNextPage;
        tCursor = conn.pageInfo.endCursor;
      }
    }
  } catch (e) { /* falls Scope fehlt: leer */ }

  // Übersetzte Titel/Meta-Werte + Sprachenliste direkt an jedes Produkt hängen, damit die
  // Client-seitige Suche/Filterung (useProductFilters) ohne zusätzliche Props darauf zugreifen kann.
  for (const edge of allProducts) {
    edge.node.translatedContent = translatedContentByProduct[edge.node.id] ?? {};
    edge.node.translatedLocaleCodes = translatedLocalesByProduct[edge.node.id] ?? [];
  }

  // Metaobject-Referenz-Metafields (z.B. "Eigenschaften") liefern in .value nur ein JSON-Array
  // roher GIDs — für eine lesbare Anzeige in der Produktliste hier einmalig alle referenzierten
  // Metaobjects bündeln (statt pro Produkt einzeln nachzuladen) und zu "Bezeichnung: Wert" auflösen.
  const metaobjectIds = new Set();
  for (const edge of allProducts) {
    for (const mfEdge of edge.node.metafields?.edges ?? []) {
      const val = mfEdge.node.value;
      if (typeof val !== "string" || !val.startsWith("[")) continue;
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => { if (typeof id === "string" && id.includes("gid://shopify/Metaobject/")) metaobjectIds.add(id); });
        }
      } catch { /* kein JSON-Array, ignorieren */ }
    }
  }

  const metaobjectLabels = {};
  const metaobjectBezeichnung = {};
  const idList = [...metaobjectIds];
  for (let i = 0; i < idList.length; i += 250) {
    const chunk = idList.slice(i, i + 250);
    const nodesRes = await admin.graphql(`
      query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Metaobject { id fields { key value } }
        }
      }
    `, { variables: { ids: chunk } });
    const nodesJson = await nodesRes.json();
    for (const node of nodesJson.data?.nodes ?? []) {
      if (!node) continue;
      const bezeichnung = node.fields?.find((f) => f.key === "bezeichnung")?.value;
      const wert = node.fields?.find((f) => f.key === "wert")?.value;
      metaobjectLabels[node.id] = bezeichnung && wert ? `${bezeichnung}: ${wert}` : (wert || bezeichnung || null);
      if (bezeichnung) metaobjectBezeichnung[node.id] = bezeichnung;
    }
  }

  // Aufgelöste Anzeige-Werte direkt an die Metafields hängen, ohne die Original-.value zu verlieren.
  // "bezeichnungen" hält zusätzlich nur die reinen Namen (z.B. "Material", "Herkunft") ohne die
  // Werte — Grundlage für einen sauberen Filter, ohne dass jede Wert-Kombination einzeln auftaucht.
  for (const edge of allProducts) {
    for (const mfEdge of edge.node.metafields?.edges ?? []) {
      const val = mfEdge.node.value;
      if (typeof val !== "string" || !val.startsWith("[")) continue;
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string" && id.includes("gid://shopify/Metaobject/"))) {
          mfEdge.node.displayValue = parsed.map((id) => metaobjectLabels[id]).filter(Boolean).join(", ");
          mfEdge.node.bezeichnungen = [...new Set(parsed.map((id) => metaobjectBezeichnung[id]).filter(Boolean))];
        }
      } catch { /* ignorieren */ }
    }
  }

  return { products: allProducts, host, shop, locationId, locales, translatedLocalesByProduct };
}
