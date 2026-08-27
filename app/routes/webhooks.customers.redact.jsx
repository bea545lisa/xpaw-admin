import { authenticate } from "../shopify.server";

// Pflicht-Webhook (GDPR/Datenschutz): Kundendaten sollen gelöscht werden. Diese App speichert
// keine eigenen Kundendaten (alles liegt bei Shopify), daher gibt es hier nichts zu löschen -
// der Webhook muss aber existieren und mit 200 antworten, sonst verweigert Shopify der App den
// Zugriff auf geschützte Kundendaten (z.B. Bestellungen mit Name/Adresse).
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log(`Webhook ${topic} für ${shop} empfangen`, payload?.customer?.id);
  return new Response();
};
