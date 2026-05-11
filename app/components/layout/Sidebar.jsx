import { Link, useLocation } from "react-router";

const navigation = [
  { label: "Dashboard", to: "/app" },
  { label: "Produkte", to: "/app/products" },
  { label: "Additional", to: "/app/additional" },
];

export default function Sidebar() {
  const location = useLocation();
  const search = location.search || "";

  return (
    <aside
      style={{
        width: "250px",
        height: "100vh",
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        padding: "24px 16px",
        boxSizing: "border-box",
        position: "sticky",
        top: 0,
      }}
    >
      <div style={{ marginBottom: "36px", padding: "0 10px" }}>
        <div
          style={{
            fontSize: "28px",
            fontWeight: "700",
            color: "#111827",
            letterSpacing: "-0.5px",
          }}
        >
          RexPaw
        </div>

        <div
          style={{
            marginTop: "4px",
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          Shopify Admin
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {navigation.map((item) => (
          <SidebarItem
            key={item.to}
            label={item.label}
            to={`${item.to}${search}`}
            active={
              item.to === "/app"
                ? location.pathname === "/app"
                : location.pathname.startsWith(item.to)
            }
          />
        ))}
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
        border: "none",
        background: active ? "#f3f4f6" : "transparent",
        padding: "12px 14px",
        borderRadius: "12px",
        textAlign: "left",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: active ? "600" : "500",
        color: active ? "#111827" : "#4b5563",
        transition: "all 0.2s ease",
        textDecoration: "none",
      }}
    >
      {label}
    </Link>
  );
}
