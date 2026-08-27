import { authenticate } from "../shopify.server";

// Pflicht-Webhook (GDPR/Datenschutz): Ein Kunde/Shop-Betreiber fordert eine Kopie der über
// diesen Kunden gespeicherten Daten an. Diese App speichert keine Kundendaten selbst
// (alles liegt bei Shopify), daher gibt es hier nichts auszuliefern - der Webhook muss aber
// existieren und mit 200 antworten, sonst verweigert Shopify der App den Zugriff auf
// geschützte Kundendaten (z.B. Bestellungen mit Name/Adresse).
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Webhook ${topic} für ${shop} empfangen`, payload?.customer?.id);
  return new Response();
};
