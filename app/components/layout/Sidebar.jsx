import { useState } from "react";
import { Link, useLocation, useNavigation } from "react-router";
import { HomeIcon, ProductIcon, OrderIcon } from "@shopify/polaris-icons";

function ActiveIndicator({ isFirst }) {
  const lineY  = isFirst ? 19 : 54;
  const curveY = isFirst ? 26 : 61;
  const ax     = 10;

  return (
    <svg
      style={{ position: "absolute", left: 20, top: -9, overflow: "visible", pointerEvents: "none", zIndex: 1 }}
      width={ax + 3}
      height={curveY + 3}
    >
      <path
        d={`M0.5 0 L0.5 ${lineY} Q0.5 ${curveY} 4 ${curveY} L${ax} ${curveY}`}
        stroke="#c4c7cc" strokeWidth="1" fill="none" strokeLinecap="round"
      />
      <path
        d={`M${ax - 2} ${curveY - 2} L${ax} ${curveY} L${ax - 2} ${curveY + 2}`}
        stroke="#c4c7cc" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const navigation = useNavigation();
  const [hoveredSub, setHoveredSub] = useState(null);
  const [produkteHovered, setProduktHovered] = useState(false);

  const pendingPath = navigation.location?.pathname;
  const activePath = pendingPath ?? location.pathname;

  const search = location.search || "";
  const link = (to) => (search ? `${to}${search}` : to);

  const isInProductArea =
    activePath.startsWith("/app/products") ||
    activePath.startsWith("/app/collections") ||
    activePath.startsWith("/app/tags");

  const submenuOpen = isInProductArea || produkteHovered;

  const hasActiveSub =
    activePath.startsWith("/app/collections") ||
    activePath.startsWith("/app/tags");

  const isProductsActive = activePath.startsWith("/app/products") && !hasActiveSub;

  const activeSubIndex = activePath.startsWith("/app/collections") ? 0
    : activePath.startsWith("/app/tags") ? 1
    : null;

  const indicatorTarget = hoveredSub !== null ? hoveredSub : activeSubIndex;

  return (
    <aside style={{
      width: 240,
      minHeight: "100vh",
      background: "#f1f1f1",
      flexShrink: 0,
      boxSizing: "border-box",
      padding: "24px 12px 16px",
    }}>
      <div style={{ padding: "0 10px", marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#111827", letterSpacing: "-0.5px" }}>RexPaw</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Shopify Admin</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Link to={link("/app")} className={`sb-item${activePath === "/app" ? " active" : ""}`}>
          <span style={{ opacity: activePath === "/app" ? 1 : 0.55, display: "flex" }}>
            <HomeIcon width={18} height={18} />
          </span>
          Dashboard
        </Link>

        <Link
          to={link("/app/products")}
          className={`sb-item${isProductsActive ? " active" : ""}`}
          onMouseEnter={() => setProduktHovered(true)}
          onMouseLeave={() => setProduktHovered(false)}
        >
          <span style={{ opacity: submenuOpen ? 1 : 0.55, display: "flex" }}>
            <ProductIcon width={18} height={18} />
          </span>
          Produkte
        </Link>

        {submenuOpen && (
          <div
            style={{ position: "relative" }}
            onMouseEnter={() => setProduktHovered(true)}
            onMouseLeave={() => setProduktHovered(false)}
          >
            {indicatorTarget !== null && (
              <ActiveIndicator isFirst={indicatorTarget === 0} />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Link
                to={link("/app/collections")}
                className={`sb-sub${activePath.startsWith("/app/collections") ? " active" : ""}`}
                onMouseEnter={() => setHoveredSub(0)}
                onMouseLeave={() => setHoveredSub(null)}
              >
                Kollektionen
              </Link>
              <Link
                to={link("/app/tags")}
                className={`sb-sub${activePath.startsWith("/app/tags") ? " active" : ""}`}
                onMouseEnter={() => setHoveredSub(1)}
                onMouseLeave={() => setHoveredSub(null)}
              >
                Tags
              </Link>
            </div>
          </div>
        )}

        <Link to={link("/app/orders")} className={`sb-item${activePath.startsWith("/app/orders") ? " active" : ""}`}>
          <span style={{ opacity: activePath.startsWith("/app/orders") ? 1 : 0.55, display: "flex" }}>
            <OrderIcon width={18} height={18} />
          </span>
          Bestellungen
        </Link>
      </nav>
    </aside>
  );
}
