import { authenticate } from "../shopify.server";

// Pflicht-Webhook (GDPR/Datenschutz): 48h nach Deinstallation fordert Shopify die Löschung aller
// gespeicherten Shop-Daten an. Diese App speichert außer der Session (die bereits beim
// app/uninstalled-Webhook gelöscht wird) keine eigenen Shop-Daten - der Webhook muss aber
// existieren und mit 200 antworten, sonst verweigert Shopify der App den Zugriff auf
// geschützte Kundendaten (z.B. Bestellungen mit Name/Adresse).
export const action = async ({ request }) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`Webhook ${topic} für ${shop} empfangen`);
  return new Response();
};
