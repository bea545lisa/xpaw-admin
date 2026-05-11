export default function ProductSkeleton({ rows = 8 }) {
  return (
    <div style={{ padding: "0 8px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="product-grid"
          style={{
            borderTop: "1px solid var(--p-color-border-subdued)",
            padding: "8px 0",
            opacity: 1 - i * 0.08,  // nach unten ausblenden
          }}
        >
          {/* Spalte 1: Titel */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 20, height: 20, borderRadius: 4, background: "#e5e7eb" }} />
            {/* Bild */}
            <div style={{ width: 40, height: 40, borderRadius: 4, background: "#e5e7eb", flexShrink: 0 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <div style={{ height: 12, borderRadius: 4, background: "#e5e7eb", width: `${50 + Math.random() * 30}%` }} />
              <div style={{ height: 10, borderRadius: 4, background: "#f3f4f6", width: `${20 + Math.random() * 20}%` }} />
            </div>
          </div>
          {/* Preis */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ height: 12, borderRadius: 4, background: "#e5e7eb", width: 48 }} />
          </div>
          {/* Inventar */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ height: 12, borderRadius: 4, background: "#e5e7eb", width: 24 }} />
          </div>
          {/* Status */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", alignSelf: "stretch" }}>
            <div style={{ height: 20, borderRadius: 10, background: "#e5e7eb", width: 60 }} />
          </div>
          {/* Aktionen */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", alignSelf: "stretch" }}>
            <div style={{ height: 12, borderRadius: 4, background: "#e5e7eb", width: 20 }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes shimmer {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        .product-grid > div > div[style*="e5e7eb"],
        .product-grid > div[style*="e5e7eb"] {
          animation: shimmer 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
