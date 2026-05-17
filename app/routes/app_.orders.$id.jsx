import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import AppLayout from "../components/layout/AppLayout";
import { OrderIcon, ArrowLeftIcon } from "@shopify/polaris-icons";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Text,
} from "@shopify/polaris";

const ORDER_DETAIL_QUERY = `
  query($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      updatedAt
      displayFinancialStatus
      displayFulfillmentStatus
      currencyCode
      note
      tags
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            sku
            variant { price compareAtPrice image { url altText } }
            originalTotalSet { shopMoney { amount } }
          }
        }
      }
      customer { id firstName lastName email phone }
      shippingAddress {
        name address1 address2 city province zip country
      }
      billingAddress {
        name address1 address2 city province zip country
      }
      fulfillments {
        status
        trackingInfo { number url company }
        createdAt
      }
      transactions(first: 5) {
        id
        status
        kind
        gateway
        amountSet { shopMoney { amount currencyCode } }
        createdAt
      }
    }
  }
`;

// ── Badges ──────────────────────────────────────────────────────────────

const FINANCIAL_BADGE = {
  PAID: { tone: "success", label: "Bezahlt" },
  PENDING: { tone: "warning", label: "Ausstehend" },
  REFUNDED: { tone: "info", label: "Erstattet" },
  PARTIALLY_REFUNDED: { tone: "info", label: "Teilerstattung" },
  VOIDED: { tone: "critical", label: "Storniert" },
  AUTHORIZED: { tone: "attention", label: "Autorisiert" },
  PARTIALLY_PAID: { tone: "warning", label: "Teilzahlung" },
};

const FULFILLMENT_BADGE = {
  FULFILLED: { tone: "success", label: "Versendet" },
  UNFULFILLED: { tone: "warning", label: "Offen" },
  PARTIAL: { tone: "attention", label: "Teilweise" },
  RESTOCKED: { tone: "info", label: "Wiedereingelagert" },
  IN_PROGRESS: { tone: "attention", label: "In Bearbeitung" },
  ON_HOLD: { tone: "warning", label: "Zurückgestellt" },
  SCHEDULED: { tone: "info", label: "Geplant" },
};

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso, withTime = false) {
  if (!iso) return "—";
  const opts = withTime
    ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric" };
  return new Date(iso).toLocaleDateString("de-DE", opts);
}

function formatPrice(amount, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(amount) || 0);
}

function AddressBlock({ address }) {
  if (!address) return <Text as="p" tone="subdued">Keine Adresse</Text>;
  return (
    <BlockStack gap="050">
      {address.name && <Text as="p" variant="bodySm" fontWeight="semibold">{address.name}</Text>}
      {address.address1 && <Text as="p" variant="bodySm">{address.address1}</Text>}
      {address.address2 && <Text as="p" variant="bodySm">{address.address2}</Text>}
      <Text as="p" variant="bodySm">{[address.zip, address.city].filter(Boolean).join(" ")}</Text>
      {address.province && <Text as="p" variant="bodySm">{address.province}</Text>}
      <Text as="p" variant="bodySm">{address.country}</Text>
    </BlockStack>
  );
}

function SectionCard({ title, children }) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text as="h2" variant="headingSm">{title}</Text>
          <Divider />
          {children}
        </BlockStack>
      </Box>
    </Card>
  );
}

// ── Loader ───────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const gid = `gid://shopify/Order/${params.id}`;
  const response = await admin.graphql(ORDER_DETAIL_QUERY, { variables: { id: gid } });
  const json = await response.json();
  const order = json?.data?.order;
  if (!order) throw new Response("Nicht gefunden", { status: 404 });
  return { order };
};

// ── Komponente ───────────────────────────────────────────────────────────

export default function OrderDetail() {
  const { order } = useLoaderData();
  const navigate = useNavigate();

  const financial = FINANCIAL_BADGE[order.displayFinancialStatus] ?? { tone: "new", label: order.displayFinancialStatus };
  const fulfillment = FULFILLMENT_BADGE[order.displayFulfillmentStatus] ?? { tone: "new", label: order.displayFulfillmentStatus };
  const currency = order.totalPriceSet?.shopMoney?.currencyCode ?? "EUR";

  const lineItems = order.lineItems?.edges?.map(({ node }) => node) ?? [];
  const tracking = order.fulfillments?.[0]?.trackingInfo?.[0];

  return (
    <AppLayout>
      <div style={{ padding: "20px 32px", minHeight: "100vh", background: "#f6f6f7" }}>
        <BlockStack gap="500">

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button
              variant="plain"
              icon={<ArrowLeftIcon width={16} height={16} />}
              onClick={() => navigate("/app/orders")}
              accessibilityLabel="Zurück zur Bestellungsliste"
            />
            <OrderIcon width={20} height={20} />
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{order.name}</h1>
            <Badge tone={financial.tone}>{financial.label}</Badge>
            <Badge tone={fulfillment.tone}>{fulfillment.label}</Badge>
            <Text as="p" variant="bodySm" tone="subdued" style={{ marginLeft: "auto" }}>
              {formatDate(order.createdAt, true)}
            </Text>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

            {/* Linke Spalte */}
            <BlockStack gap="400">

              {/* Artikel */}
              <SectionCard title={`Artikel (${lineItems.length})`}>
                <BlockStack gap="300">
                  {lineItems.map((item) => {
                    const img = item.variant?.image?.url;
                    const price = Number.parseFloat(item.variant?.price ?? 0);
                    const total = Number.parseFloat(item.originalTotalSet?.shopMoney?.amount ?? 0);
                    return (
                      <div key={item.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        {img ? (
                          <img
                            src={img}
                            alt={item.variant?.image?.altText ?? item.title}
                            style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{ width: 48, height: 48, borderRadius: 6, background: "#f3f4f6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Text as="span" variant="bodySm" tone="subdued">–</Text>
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <Text as="p" variant="bodySm" fontWeight="semibold">{item.title}</Text>
                          {item.sku && <Text as="p" variant="bodySm" tone="subdued">SKU: {item.sku}</Text>}
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">{item.quantity} × {formatPrice(price, currency)}</Text>
                        <Text as="p" variant="bodySm" fontWeight="semibold" style={{ minWidth: 70, textAlign: "right" }}>
                          {formatPrice(total, currency)}
                        </Text>
                      </div>
                    );
                  })}
                  <Divider />
                  {/* Summen */}
                  {[
                    { label: "Zwischensumme", amount: order.subtotalPriceSet?.shopMoney?.amount },
                    { label: "Versand", amount: order.totalShippingPriceSet?.shopMoney?.amount },
                    { label: "Rabatt", amount: order.totalDiscountsSet?.shopMoney?.amount, negative: true },
                    { label: "MwSt.", amount: order.totalTaxSet?.shopMoney?.amount },
                  ].filter(({ amount }) => Number(amount) > 0).map(({ label, amount, negative }) => (
                    <InlineStack key={label} align="space-between">
                      <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
                      <Text as="p" variant="bodySm">{negative ? "−" : ""}{formatPrice(amount, currency)}</Text>
                    </InlineStack>
                  ))}
                  <Divider />
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Gesamt</Text>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      {formatPrice(order.totalPriceSet?.shopMoney?.amount, currency)}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </SectionCard>

              {/* Versandinformationen */}
              {order.fulfillments?.length > 0 && (
                <SectionCard title="Versand">
                  <BlockStack gap="200">
                    {order.fulfillments.map((f, i) => (
                      <div key={i}>
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="p" variant="bodySm" fontWeight="semibold">Sendung {i + 1}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{formatDate(f.createdAt, true)}</Text>
                        </InlineStack>
                        {f.trackingInfo?.map((t, j) => (
                          <BlockStack key={j} gap="050">
                            <Text as="p" variant="bodySm">Tracking: {t.number}</Text>
                            {t.company && <Text as="p" variant="bodySm" tone="subdued">{t.company}</Text>}
                            {t.url && (
                              <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--p-color-text-interactive)" }}>
                                Sendung verfolgen →
                              </a>
                            )}
                          </BlockStack>
                        ))}
                      </div>
                    ))}
                  </BlockStack>
                </SectionCard>
              )}

              {/* Notiz */}
              {order.note && (
                <SectionCard title="Notiz">
                  <Text as="p" variant="bodySm">{order.note}</Text>
                </SectionCard>
              )}

            </BlockStack>

            {/* Rechte Spalte */}
            <BlockStack gap="400">

              {/* Kunde */}
              <SectionCard title="Kunde">
                {order.customer ? (
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      {order.customer.firstName} {order.customer.lastName}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">{order.customer.email}</Text>
                    {order.customer.phone && (
                      <Text as="p" variant="bodySm" tone="subdued">{order.customer.phone}</Text>
                    )}
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">Gastkauf</Text>
                )}
              </SectionCard>

              {/* Lieferadresse */}
              <SectionCard title="Lieferadresse">
                <AddressBlock address={order.shippingAddress} />
              </SectionCard>

              {/* Rechnungsadresse */}
              <SectionCard title="Rechnungsadresse">
                <AddressBlock address={order.billingAddress} />
              </SectionCard>

              {/* Tags */}
              {order.tags?.length > 0 && (
                <SectionCard title="Tags">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {order.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: "2px 10px",
                          borderRadius: 20,
                          background: "#f3f4f6",
                          fontSize: 12,
                          color: "#374151",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </SectionCard>
              )}

            </BlockStack>
          </div>
        </BlockStack>
      </div>
    </AppLayout>
  );
}
