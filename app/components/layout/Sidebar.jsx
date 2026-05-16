import { useLocation } from "react-router";
import { Navigation } from "@shopify/polaris";
import { ProductIcon } from "@shopify/polaris-icons";

export default function Sidebar() {
  const location = useLocation();
  const pathname = location.pathname;
  const search = location.search;

  const withSearch = (to) => {
    if (!search) return to;
    return to.includes("?") ? `${to}&${search.slice(1)}` : `${to}${search}`;
  };

  return (
    <aside style={{
      width: "250px",
      height: "100vh",
      background: "rgb(241, 241, 241)",
      boxSizing: "border-box",
      position: "sticky",
      top: 0,
    }}>
      <div style={{ padding: "24px 16px 16px" }}>
        <div style={{ fontSize: "28px", fontWeight: "700", color: "#111827", letterSpacing: "-0.5px" }}>RexPaw</div>
        <div style={{ marginTop: "4px", fontSize: "13px", color: "#9ca3af" }}>Shopify Admin</div>
      </div>

      <Navigation location={pathname}>
        <Navigation.Section
          items={[
            {
              label: "Dashboard",
              url: withSearch("/app"),
              exactMatch: true,
              selected: pathname === "/app",
            },
            {
              label: "Produkte",
              url: withSearch("/app/products"),
              icon: ProductIcon,
              selected: pathname.startsWith("/app/products") || pathname.startsWith("/app/collections") || pathname.startsWith("/app/tags"),
              subNavigationItems: [
                {
                  label: "Kollektionen",
                  url: withSearch("/app/collections"),
                  selected: pathname.startsWith("/app/collections"),
                },
                {
                  label: "Tags",
                  url: withSearch("/app/tags"),
                  selected: pathname.startsWith("/app/tags"),
                },
              ],
            },
          ]}
        />
      </Navigation>
    </aside>
  );
}
