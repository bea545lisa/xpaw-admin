import { useLocation } from "react-router";

const titles = [
  { match: /^\/app$/, title: "Dashboard" },
  { match: /^\/app\/products/, title: "Produkte" },
  { match: /^\/app\/additional/, title: "Additional" },
];

export default function Topbar() {
  const location = useLocation();
  const pageTitle = titles.find((entry) => entry.match.test(location.pathname))?.title ?? "RexPaw Admin";

  return (
    <header
      style={{
        height: "56px",
        background: "#ffffff",
        borderBottom: "1px solid #e3e3e3",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        marginBottom: "24px",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>
        {pageTitle}
      </h1>
    </header>
  );
}
