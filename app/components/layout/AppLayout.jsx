import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f6f6f7",
      }}
    >
      <Sidebar />

      <main
        style={{
            flex: 1,
            padding: "12px 24px",
            overflow: "auto",
        }}
        >
        <Topbar />

        <div            
            style={{
                minHeight: "calc(100vh - 120px)",
                maxWidth: "1600px",
                margin: "0 auto",
            }}
            >
            {children}
        </div>

      </main>
    </div>
  );
}