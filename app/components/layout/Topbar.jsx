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
        height: "72px",
        background: "#ffffff",
        borderBottom: "1px solid #e3e3e3",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        borderRadius: "16px",
        marginBottom: "24px",
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "20px",
            fontWeight: "600",
          }}
        >
          {pageTitle}
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <input
          type="text"
          placeholder="Search..."
          style={{
            border: "1px solid #dcdcdc",
            borderRadius: "10px",
            padding: "10px 14px",
            width: "220px",
          }}
        />

        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            background: "#111827",
          }}
        />
      </div>
    </header>
  );
}
