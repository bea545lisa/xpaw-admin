// Ein Produkt/eine Kollektion ist in Shopify erst im Storefront sichtbar, wenn es zusätzlich zum
// Status (Aktiv/Entwurf) auch explizit im Vertriebskanal "Online Store" veröffentlicht wurde —
// das passiert bei productCreate/collectionCreate NICHT automatisch. Dieser Helper holt die
// Online-Store-Publication-ID und veröffentlicht die Ressource direkt mit.
let cachedOnlineStorePublicationId = null;

async function getOnlineStorePublicationId(admin) {
  if (cachedOnlineStorePublicationId) return cachedOnlineStorePublicationId;
  const res = await admin.graphql(`
    query {
      publications(first: 10) {
        edges { node { id name } }
      }
    }
  `);
  const json = await res.json();
  const pub = json.data?.publications?.edges?.find((e) => e.node.name === "Online Store")?.node;
  cachedOnlineStorePublicationId = pub?.id ?? null;
  return cachedOnlineStorePublicationId;
}

export async function publishToOnlineStore(admin, resourceId) {
  const publicationId = await getOnlineStorePublicationId(admin);
  if (!publicationId) return { ok: false, error: "Online-Store-Kanal nicht gefunden" };

  const res = await admin.graphql(`
    mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }
  `, { variables: { id: resourceId, input: [{ publicationId }] } });
  const json = await res.json();
  const errors = json.data?.publishablePublish?.userErrors ?? [];
  return { ok: errors.length === 0, errors };
}
