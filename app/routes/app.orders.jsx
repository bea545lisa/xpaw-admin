import { useState, useEffect } from "react";
import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { ordersLoader } from "../loaders/orders.loader.server";
import { OrderIcon, SearchIcon } from "@shopify/polaris-icons";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return ordersLoader({ request }, admin);
};

// ── Status-Mapping ──────────────────────────────────────────────────────

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
  PENDING_FULFILLMENT: { tone: "attention", label: "In Bearbeitung" },
  IN_PROGRESS: { tone: "attention", label: "In Bearbeitung" },
  ON_HOLD: { tone: "warning", label: "Zurückgestellt" },
  SCHEDULED: { tone: "info", label: "Geplant" },
};

function FinancialBadge({ status }) {
  const cfg = FINANCIAL_BADGE[status] ?? { tone: "new", label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function FulfillmentBadge({ status }) {
  const cfg = FULFILLMENT_BADGE[status] ?? { tone: "new", label: status };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatPrice(amount, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(amount);
}

// ── Filter-Optionen ──────────────────────────────────────────────────────

const FINANCIAL_OPTIONS = [
  { label: "Alle Zahlungen", value: "" },
  { label: "Bezahlt", value: "paid" },
  { label: "Ausstehend", value: "pending" },
  { label: "Erstattet", value: "refunded" },
  { label: "Storniert", value: "voided" },
];

const FULFILLMENT_OPTIONS = [
  { label: "Alle Versandstatus", value: "" },
  { label: "Offen", value: "unfulfilled" },
  { label: "Versendet", value: "shipped" },
  { label: "Teilweise", value: "partial" },
];

// ── Hauptkomponente ──────────────────────────────────────────────────────

export default function OrdersPage() {
  const { orders, accessDenied } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const financialStatus = searchParams.get("financialStatus") || "";
  const fulfillmentStatus = searchParams.get("fulfillmentStatus") || "";

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (search) next.set("search", search); else next.delete("search");
      next.delete("cursor");
      setSearchParams(next);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("cursor");
    setSearchParams(next);
  };

  const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const currency = orders[0]?.currency ?? "EUR";

  if (accessDenied) {
    return (
      <div style={{ padding: "20px 32px" }}>
        <Card>
          <Box padding="600">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Kein Zugriff auf Bestellungen</Text>
              <Text as="p" tone="subdued">
                Die App benötigt den Scope <code>read_orders</code>. Starte den Dev-Server mit{" "}
                <code>shopify app dev --reset</code> um die Berechtigung neu anzufordern.
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: "#f6f6f7" }}>
      <BlockStack gap="500">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <OrderIcon width={22} height={22} />
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bestellungen</h1>
          </div>
          <Text as="p" variant="bodySm" tone="subdued">
            {orders.length} Bestellungen · {formatPrice(totalRevenue, currency)} Umsatz
          </Text>
        </div>

        {/* Filter-Bar */}
        <Card>
          <Box padding="300">
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <div style={{ flex: 1, maxWidth: 320 }}>
                <TextField
                  prefix={<SearchIcon width={16} height={16} />}
                  placeholder="Bestellnummer oder E-Mail…"
                  value={search}
                  onChange={setSearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearch("")}
                />
              </div>
              <div style={{ minWidth: 180 }}>
                <Select
                  label=""
                  labelHidden
                  options={FINANCIAL_OPTIONS}
                  value={financialStatus}
                  onChange={(v) => setFilter("financialStatus", v)}
                />
              </div>
              <div style={{ minWidth: 200 }}>
                <Select
                  label=""
                  labelHidden
                  options={FULFILLMENT_OPTIONS}
                  value={fulfillmentStatus}
                  onChange={(v) => setFilter("fulfillmentStatus", v)}
                />
              </div>
              {(search || financialStatus || fulfillmentStatus) && (
                <Button
                  variant="plain"
                  onClick={() => {
                    setSearch("");
                    setSearchParams({});
                  }}
                >
                  Zurücksetzen
                </Button>
              )}
            </InlineStack>
          </Box>
        </Card>

        {/* Tabelle */}
        <Card padding="0">
          {orders.length === 0 ? (
            <Box padding="600">
              <Text as="p" tone="subdued" alignment="center">Keine Bestellungen gefunden.</Text>
            </Box>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    {["Bestellung", "Datum", "Kunde", "Produkte", "Betrag", "Zahlung", "Versand"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          textAlign: "left",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#6b7280",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, idx) => {
                    const customerName = order.customer
                      ? `${order.customer.firstName ?? ""} ${order.customer.lastName ?? ""}`.trim() || order.customer.email
                      : "Gast";
                    const itemCount = order.lineItems?.edges?.length ?? 0;
                    const firstItem = order.lineItems?.edges?.[0]?.node;
                    const itemLabel = itemCount === 1
                      ? firstItem?.title ?? "1 Artikel"
                      : `${firstItem?.title ?? "Artikel"} +${itemCount - 1}`;

                    return (
                      <tr
                        key={order.id}
                        onClick={() => navigate(`/app/orders/${order.numericId}`)}
                        style={{
                          borderBottom: idx < orders.length - 1 ? "1px solid #f3f4f6" : "none",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                        onMouseLeave={(e) => e.currentTarget.style.background = ""}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <Text as="span" variant="bodySm" fontWeight="semibold">{order.name}</Text>
                        </td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <Text as="span" variant="bodySm" tone="subdued">{formatDate(order.createdAt)}</Text>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <BlockStack gap="050">
                            <Text as="span" variant="bodySm">{customerName}</Text>
                            {order.shippingAddress?.city && (
                              <Text as="span" variant="bodySm" tone="subdued">
                                {order.shippingAddress.city}, {order.shippingAddress.country}
                              </Text>
                            )}
                          </BlockStack>
                        </td>
                        <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {itemLabel}
                          </Text>
                        </td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <Text as="span" variant="bodySm" fontWeight="semibold">
                            {formatPrice(order.totalPrice, order.currency)}
                          </Text>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <FinancialBadge status={order.displayFinancialStatus} />
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <FulfillmentBadge status={order.displayFulfillmentStatus} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </BlockStack>
    </div>
  );
}
