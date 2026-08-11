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

// Darf niemals werfen — wird nach dem eigentlichen Erstellen/Aktivieren aufgerufen und soll bei
// einem Fehler (z.B. fehlender Scope, Online-Store-Kanal nicht installiert) nicht die gesamte
// Aktion zum Absturz bringen. Die Hauptressource ist zu diesem Zeitpunkt bereits gespeichert.
export async function publishToOnlineStore(admin, resourceId) {
  try {
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
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
