import Sidebar from "./Sidebar";
//import Topbar from "./Topbar";

export default function AppLayout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f8f8f8",
      }}
    >
      <Sidebar />

      <main
        style={{
            flex: 1,
            padding: "12px 16px",
            overflow: "auto",
        }}
        >
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
