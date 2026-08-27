import { useState, useEffect, useRef } from "react";
import { useLoaderData, useSearchParams, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { useColorScheme } from "../context/ColorSchemeContext";
import { ordersLoader } from "../loaders/orders.loader.server";
import { OrderIcon } from "@shopify/polaris-icons";
import { Badge, BlockStack, Box, Card, Text } from "@shopify/polaris";
import OrderToolbar from "../components/OrderToolbar";

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

// ── Hauptkomponente ──────────────────────────────────────────────────────

export default function OrdersPage() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { orders, accessDenied, accessDeniedMessage, error } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [financialStatus, setFinancialStatus] = useState(searchParams.get("financialStatus") || "");
  const [fulfillmentStatus, setFulfillmentStatus] = useState(searchParams.get("fulfillmentStatus") || "");

  // Einen kombinierten Effect: baut die URL aus allen drei Werten in einem Schritt
  const committedSearch      = useRef(searchParams.get("search") || "");
  const committedFinancial   = useRef(searchParams.get("financialStatus") || "");
  const committedFulfillment = useRef(searchParams.get("fulfillmentStatus") || "");

  useEffect(() => {
    const searchChanged     = search !== committedSearch.current;
    const financialChanged  = financialStatus !== committedFinancial.current;
    const fulfillmentChanged = fulfillmentStatus !== committedFulfillment.current;
    if (!searchChanged && !financialChanged && !fulfillmentChanged) return;

    const delay = searchChanged ? 350 : 0;
    const t = setTimeout(() => {
      committedSearch.current      = search;
      committedFinancial.current   = financialStatus;
      committedFulfillment.current = fulfillmentStatus;
      const next = new URLSearchParams();
      if (search)            next.set("search", search);
      if (financialStatus)   next.set("financialStatus", financialStatus);
      if (fulfillmentStatus) next.set("fulfillmentStatus", fulfillmentStatus);
      setSearchParams(next, { replace: true });
    }, delay);
    return () => clearTimeout(t);
  }, [search, financialStatus, fulfillmentStatus]);

  const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
  const currency = orders[0]?.currency ?? "EUR";

  if (error) {
    return (
      <div style={{ padding: "20px 32px" }}>
        <Card><Box padding="600"><Text as="p" tone="critical">{error}</Text></Box></Card>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div style={{ padding: "20px 32px" }}>
        <Card>
          <Box padding="600">
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Kein Zugriff auf Bestellungen</Text>
              <Text as="p" tone="subdued">
                {accessDeniedMessage || "Die App hat keinen Zugriff auf Bestellungen (genaue Ursache unbekannt)."}
              </Text>
            </BlockStack>
          </Box>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
      <BlockStack gap="500">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", fill: isDark ? "#f3f4f6" : "#555" }}><OrderIcon width={22} height={22} /></span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Bestellungen</h1>
          </div>
          <Text as="p" variant="bodySm" tone="subdued">
            {orders.length} Bestellungen · {formatPrice(totalRevenue, currency)} Umsatz
          </Text>
        </div>

        {/* Filter-Bar */}
          <OrderToolbar
            search={search} setSearch={setSearch}
            financialStatus={financialStatus} setFinancialStatus={setFinancialStatus}
            fulfillmentStatus={fulfillmentStatus} setFulfillmentStatus={setFulfillmentStatus}
          />

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
                          borderBottom: `1px solid ${isDark ? "#3a3a3a" : "#f3f4f6"}`,
                          cursor: "pointer",
                          transition: "background 0.1s",
                          background: isDark ? (idx % 2 === 0 ? "#2f2f2f" : "#282828") : "#fff",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isDark ? "#222222" : "#f9fafb"}
                        onMouseLeave={(e) => e.currentTarget.style.background = isDark ? (idx % 2 === 0 ? "#2f2f2f" : "#282828") : "#fff"}
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
