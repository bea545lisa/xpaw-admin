import { Link, useLocation } from "react-router";
import { useState } from "react";
import { ProductIcon } from "@shopify/polaris-icons";

const navigation = [
  { label: "Dashboard", to: "/app" },
];

export default function Sidebar() {
  const location = useLocation();

  const isProductsArea =
    location.pathname.startsWith("/app/products") ||
    location.pathname.startsWith("/app/collections") ||
    location.pathname.startsWith("/app/tags");

  const [productsOpen, setProductsOpen] = useState(isProductsArea);

  const productsActive = location.pathname.startsWith("/app/products") &&
    !location.pathname.startsWith("/app/collections") &&
    !location.pathname.startsWith("/app/tags");

  return (
    <aside style={{
      width: "250px",
      height: "100vh",
      background: "rgb(241, 241, 241)",
      padding: "24px 16px",
      boxSizing: "border-box",
      position: "sticky",
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ marginBottom: "36px", padding: "0 10px" }}>
        <div style={{ fontSize: "28px", fontWeight: "700", color: "#111827", letterSpacing: "-0.5px" }}>
          RexPaw
        </div>
        <div style={{ marginTop: "4px", fontSize: "13px", color: "#9ca3af" }}>
          Shopify Admin
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>

        {/* Dashboard */}
        <SidebarItem
          label="Dashboard"
          to="/app"
          active={location.pathname === "/app"}
        />

        {/* Produkte-Bereich */}
        <div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link
              to="/app/products"
              onClick={() => setProductsOpen(true)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 14px",
                borderRadius: 12,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: isProductsArea ? 600 : 500,
                color: isProductsArea ? "#111827" : "#4b5563",
                background: productsActive ? "#ffffff" : "transparent",
                transition: "all 0.2s ease",
              }}
            >
              <ProductIcon width={18} height={18} />
              Produkte
            </Link>
          </div>

          {productsOpen && (
            <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
              {[
                { href: "/app/collections", label: "Kollektionen" },
                { href: "/app/tags", label: "Tags" },
              ].map(({ href, label }) => {
                const active = location.pathname === href || location.pathname.startsWith(href + "/");
                return <SubNavItem key={href} href={href} label={label} active={active} />;
              })}
            </div>
          )}
        </div>

      </nav>
    </aside>
  );
}

function SidebarItem({ label, to, active }) {
  return (
    <Link
      to={to}
      style={{
        display: "block",
        padding: "12px 14px",
        borderRadius: "12px",
        textDecoration: "none",
        fontSize: "14px",
        fontWeight: active ? "600" : "500",
        color: active ? "#111827" : "#4b5563",
        background: active ? "#ffffff" : "transparent",
        transition: "all 0.2s ease",
      }}
    >
      {label}
    </Link>
  );
}

function SubNavItem({ href, label, active }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 12px 6px 16px",
        borderRadius: 6,
        textDecoration: "none",
        fontSize: 14,
        color: active ? "#111827" : "#4b5563",
        background: active ? "#ffffff" : hovered ? "#e8e8e8" : "transparent",
        fontWeight: active ? 600 : 400,
        transition: "background 0.1s",
      }}
    >
      <span style={{
        width: 16,
        fontSize: 13,
        color: active ? "#111827" : "#aaa",
        opacity: active || hovered ? 1 : 0,
        transition: "opacity 0.1s",
      }}>
        {active ? "→" : "└"}
      </span>
      {label}
    </Link>
  );
}
