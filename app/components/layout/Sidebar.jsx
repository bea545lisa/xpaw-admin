import { useState, useRef } from "react";
import { Link, useLocation, useNavigate, useNavigation } from "react-router";
import { HomeIcon, ProductIcon, OrderIcon, SettingsIcon } from "@shopify/polaris-icons";
import { useColorScheme } from "../../context/ColorSchemeContext";

function ActiveIndicator({ index }) {
  const lineY  = 19 + index * 35;
  const curveY = 26 + index * 35;
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
  const location  = useLocation();
  const navigate  = useNavigate();
  const navigation = useNavigation();

  const { colorScheme, toggle } = useColorScheme();
  const isDark = colorScheme === "dark";

  const pendingPath = navigation.location?.pathname;
  const activePath  = pendingPath ?? location.pathname;

  const search = location.search || "";
  const link   = (to) => (search ? `${to}${search}` : to);

  const isInProductArea =
    activePath.startsWith("/app/products") ||
    activePath.startsWith("/app/collections") ||
    activePath.startsWith("/app/tags") ||
    activePath.startsWith("/app/metafields");

  // Submenu: offen wenn in Produktbereich ODER nach Hover-Delay
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimer = useRef(null);
  const submenuOpen = isInProductArea || hoverOpen;

  const handleProductAreaEnter = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverOpen(true), 1000);
  };

  const handleProductAreaLeave = () => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoverOpen(false), 150);
  };

  const hasActiveSub   = activePath.startsWith("/app/collections") || activePath.startsWith("/app/tags") || activePath.startsWith("/app/metafields");
  const isProductsActive = activePath.startsWith("/app/products") && !hasActiveSub;

  const [hoveredSub, setHoveredSub] = useState(null);
  const activeSubIndex = activePath.startsWith("/app/collections") ? 0
    : activePath.startsWith("/app/tags") ? 1
    : activePath.startsWith("/app/metafields") ? 2
    : null;
  const indicatorTarget = hoveredSub !== null ? hoveredSub : activeSubIndex;

  // Klick auf "Produkte":
  // – Wenn bereits auf Produktliste → nicht neu laden
  // – Sonst → navigieren
  const handleProductsClick = (e) => {
    e.preventDefault();
    clearTimeout(hoverTimer.current);
    if (!isProductsActive) {
      navigate(link("/app/products"));
    }
  };

  return (
    <aside style={{
      width: 240,
      minHeight: "100vh",
      background: isDark ? "#1a1a1a" : "#f1f1f1",
      borderRight: `1px solid ${isDark ? "#2e2e2e" : "#e5e7eb"}`,
      flexShrink: 0,
      boxSizing: "border-box",
      padding: "24px 12px 16px",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ padding: "0 10px", marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: isDark ? "#f9fafb" : "#111827", letterSpacing: "-0.5px" }}>XPaw</div>
        <div style={{ fontSize: 12, color: isDark ? "#6b7280" : "#9ca3af", marginTop: 2 }}>Shopify Admin</div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Link to={link("/app")} className={`sb-item${activePath === "/app" ? " active" : ""}`}>
          <span style={{ opacity: activePath === "/app" ? 1 : 0.55, display: "flex" }}>
            <HomeIcon width={18} height={18} />
          </span>
          Dashboard
        </Link>

        {/* Produkte – Hover mit Delay + kein Reload wenn schon aktiv */}
        <a
          href={link("/app/products")}
          onClick={handleProductsClick}
          onMouseEnter={handleProductAreaEnter}
          onMouseLeave={handleProductAreaLeave}
          className={`sb-item${isProductsActive ? " active" : ""}`}
        >
          <span style={{ opacity: submenuOpen ? 1 : 0.55, display: "flex" }}>
            <ProductIcon width={18} height={18} />
          </span>
          Produkte
        </a>

        {/* Submenu – gleicher Timer wie Produkte-Link → kein Springen */}
        {submenuOpen && (
          <div
            style={{ position: "relative" }}
            onMouseEnter={handleProductAreaEnter}
            onMouseLeave={handleProductAreaLeave}
          >
            {indicatorTarget !== null && (
              <ActiveIndicator index={indicatorTarget} />
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
              <Link
                to={link("/app/metafields")}
                className={`sb-sub${activePath.startsWith("/app/metafields") ? " active" : ""}`}
                onMouseEnter={() => setHoveredSub(2)}
                onMouseLeave={() => setHoveredSub(null)}
              >
                Metafields
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

        {/* Trennlinie vor Einstellungen */}
        <div style={{ margin: "8px 10px", borderTop: `1px solid ${isDark ? "#2e2e2e" : "#e5e7eb"}` }} />

        <Link to={link("/app/settings")} className={`sb-item${activePath.startsWith("/app/settings") ? " active" : ""}`}>
          <span style={{ opacity: activePath.startsWith("/app/settings") ? 1 : 0.55, display: "flex" }}>
            <SettingsIcon width={18} height={18} />
          </span>
          Einstellungen
        </Link>
      </nav>

      {/* Dark-Mode-Toggle direkt unter der Menüleiste, nicht ganz unten am Bildschirmrand */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${isDark ? "#2e2e2e" : "#e5e7eb"}`, marginLeft: -4, marginRight: -4 }}>
        <button
          onClick={toggle}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: "transparent", cursor: "pointer",
            color: "var(--p-color-text-subdued)", fontSize: 13,
          }}
          title={isDark ? "Light Mode aktivieren" : "Dark Mode aktivieren"}
        >
          <span style={{ fontSize: 16 }}>{isDark ? "☀️" : "🌙"}</span>
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>
      </div>
    </aside>
  );
}
