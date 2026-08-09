export async function collectionsLoader({ request }, admin) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const query = search ? `title:*${search}*` : "";

  const response = await admin.graphql(
    `#graphql
    query GetCollections($query: String) {
      collections(first: 50, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            descriptionHtml
            productsCount { count }
            image { url altText }
            updatedAt
          }
        }
      }
    }`,
    { variables: { first: 50, query } }
  );

  const data = await response.json();
  const collections = data.data.collections.edges.map((e) => e.node);

  let locales = [];
  try {
    const localesRes = await admin.graphql(`query { shopLocales { locale name primary published } }`);
    const localesJson = await localesRes.json();
    locales = (localesJson.data?.shopLocales ?? []).filter((l) => l.published && !l.primary);
  } catch (e) { /* falls Scope fehlt: leer */ }

  // Übersetzungsstatus pro Kollektion & Sprache — ein Bulk-Query pro Sprache statt pro Kollektion,
  // damit die Liste nicht durch N+1 Requests langsam wird.
  const translatedLocalesByCollection = {};
  try {
    for (const loc of locales) {
      const tRes = await admin.graphql(
        `#graphql
        query($locale: String!) {
          translatableResources(resourceType: COLLECTION, first: 50) {
            nodes { resourceId translations(locale: $locale) { key value } }
          }
        }`,
        { variables: { locale: loc.locale } }
      );
      const tJson = await tRes.json();
      const nodes = tJson.data?.translatableResources?.nodes ?? [];
      for (const node of nodes) {
        const hasAny = node.translations?.some((t) =>
          ["title", "body_html", "meta_title", "meta_description"].includes(t.key) && t.value?.trim()
        );
        if (!hasAny) continue;
        if (!translatedLocalesByCollection[node.resourceId]) translatedLocalesByCollection[node.resourceId] = [];
        translatedLocalesByCollection[node.resourceId].push(loc.locale);
      }
    }
  } catch (e) { /* falls Scope fehlt: leer */ }

  return { collections, locales, translatedLocalesByCollection };
}
