import { useNavigation, useLocation } from "react-router";
import Sidebar from "./Sidebar";

// ── Skeletons ──────────────────────────────────────────────────────────

function SkeletonBox({ w, h, radius = 4, style }) {
  return (
    <div className="sk-box" style={{ width: w, height: h, borderRadius: radius, ...style }} />
  );
}

function ListSkeleton() {
  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <SkeletonBox w={24} h={24} radius={4} />
        <SkeletonBox w={180} h={22} radius={6} />
      </div>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", overflow: "hidden" }}>
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} style={{ padding: "14px 16px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: 14, alignItems: "center", opacity: 1 - i * 0.1 }}>
            <SkeletonBox w={36} h={36} radius={6} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              <SkeletonBox w={`${45 + (i * 13) % 35}%`} h={12} />
              <SkeletonBox w={`${20 + (i * 7) % 20}%`} h={10} style={{ opacity: 0.5 }} />
            </div>
            <SkeletonBox w={48} h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{ padding: "32px 40px" }}>
      <SkeletonBox w={200} h={28} radius={6} style={{ marginBottom: 28 }} />
      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {[140, 160, 130, 150].map((w, i) => (
          <div key={i} style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "20px 20px 18px" }}>
            <SkeletonBox w={80} h={11} style={{ marginBottom: 12 }} />
            <SkeletonBox w={w} h={28} radius={6} style={{ marginBottom: 8 }} />
            <SkeletonBox w={60} h={10} style={{ opacity: 0.5 }} />
          </div>
        ))}
      </div>
      {/* Two column cards */}
      <div style={{ display: "flex", gap: 16 }}>
        {[1, 2].map((col) => (
          <div key={col} style={{ flex: 1, background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: 20 }}>
            <SkeletonBox w={120} h={14} style={{ marginBottom: 16 }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, opacity: 1 - i * 0.15 }}>
                <SkeletonBox w={32} h={32} radius={6} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <SkeletonBox w={`${50 + i * 10}%`} h={11} style={{ marginBottom: 6 }} />
                  <SkeletonBox w={40} h={9} style={{ opacity: 0.5 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChipSkeleton() {
  const widths = [64, 88, 56, 104, 72, 80, 60, 96, 68, 76, 52, 90];
  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <SkeletonBox w={24} h={24} radius={4} />
        <SkeletonBox w={80} h={22} radius={6} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {widths.map((w, i) => (
          <SkeletonBox key={i} w={w + 32} h={32} radius={20} style={{ opacity: 1 - i * 0.06 }} />
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div style={{ padding: "32px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <SkeletonBox w={20} h={20} radius={4} />
        <SkeletonBox w={22} h={22} radius={4} />
        <SkeletonBox w={200} h={24} radius={6} />
        <div style={{ flex: 1 }} />
        <SkeletonBox w={100} h={34} radius={8} />
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {/* Linke Spalte */}
        <div style={{ width: "33%", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "16px 18px" }}>
            <SkeletonBox w={40} h={12} style={{ marginBottom: 10 }} />
            <SkeletonBox w="100%" h={200} radius={8} style={{ marginBottom: 10 }} />
            <SkeletonBox w="100%" h={32} radius={7} />
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "16px 18px" }}>
            <SkeletonBox w={140} h={12} style={{ marginBottom: 10 }} />
            <SkeletonBox w="100%" h={34} radius={8} />
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "16px 18px" }}>
            <SkeletonBox w={80} h={11} />
          </div>
        </div>

        {/* Rechte Spalte */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "16px 18px" }}>
            <SkeletonBox w={40} h={12} style={{ marginBottom: 10 }} />
            <SkeletonBox w="100%" h={34} radius={8} />
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "16px 18px" }}>
            <SkeletonBox w={80} h={12} style={{ marginBottom: 10 }} />
            <SkeletonBox w="100%" h={110} radius={8} />
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "16px 18px" }}>
            <SkeletonBox w={40} h={13} style={{ marginBottom: 14 }} />
            <SkeletonBox w={60} h={11} style={{ marginBottom: 6 }} />
            <SkeletonBox w="100%" h={34} radius={8} style={{ marginBottom: 14 }} />
            <SkeletonBox w={70} h={11} style={{ marginBottom: 6 }} />
            <SkeletonBox w="100%" h={34} radius={8} style={{ marginBottom: 14 }} />
            <SkeletonBox w={100} h={11} style={{ marginBottom: 6 }} />
            <SkeletonBox w="100%" h={72} radius={8} />
          </div>
        </div>
      </div>
    </div>
  );
}

function pickSkeleton(pathname) {
  if (!pathname) return <ListSkeleton />;
  if (pathname === "/app" || pathname === "/app/") return <CardSkeleton />;
  //if (pathname.startsWith("/app/tags")) return <ChipSkeleton />;
  if (/^\/app\/(products|collections|orders)\/\d+/.test(pathname)) return <DetailSkeleton />;
  if (/^\/app\/tags\/.+/.test(pathname)) return <ListSkeleton />;
  return <ListSkeleton />;
}

// ── Layout ─────────────────────────────────────────────────────────────

export default function AppLayout({ children }) {
  const navigation = useNavigation();
  const location   = useLocation();

  // Skeleton nur bei echtem Seitenwechsel — nicht bei reinen Filter-/Param-Änderungen
  const isPageChange = navigation.state === "loading"
    && navigation.location?.pathname !== location.pathname;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8f8f8" }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ minHeight: "100vh", maxWidth: "1600px", margin: "0 auto" }}>
          {isPageChange ? pickSkeleton(navigation.location?.pathname) : children}
        </div>
      </main>
    </div>
  );
}
