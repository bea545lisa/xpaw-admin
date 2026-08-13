import { Outlet, useLoaderData, useNavigate } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import { Frame } from "@shopify/polaris";
import AppLayout from "../components/layout/AppLayout";
import { authenticate } from "../shopify.server";
import { useColorScheme } from "../context/ColorSchemeContext";
import { isEditorSession, getSessionEmail } from "../utils/access.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    isEditor: isEditorSession(session),
    viewerEmail: getSessionEmail(session),
  };
};

// Verhindert, dass der Parent-Loader bei jeder Client-Navigation neu ausgeführt
// wird. authenticate.admin verbraucht dabei den einmaligen JWT-Token, wodurch
// der Kind-Loader keinen gültigen Token mehr vorfindet und hängt.
export function shouldRevalidate() {
  return false;
}

export default function App() {
  const { apiKey, isEditor, viewerEmail } = useLoaderData();
  const navigate = useNavigate();
  const { colorScheme } = useColorScheme();
  const polarisTheme = colorScheme === "dark" ? "dark-experimental" : "light";

  const router = {
    history: {
      push: (path) => navigate(path),
      replace: (path) => navigate(path, { replace: true }),
    },
  };

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={{}} theme={polarisTheme}>
        <Frame router={router}>
          {!isEditor && (
            <div style={{
              background: "#fff4e4", color: "#8a5a00", padding: "8px 16px",
              textAlign: "center", fontSize: 13, fontWeight: 500,
              borderBottom: "1px solid #f1c48b",
            }}>
              Nur-Lese-Modus: Ansehen möglich, Speichern/Löschen ist für dieses Konto deaktiviert.
            </div>
          )}
          <AppLayout>
            <Outlet context={{ isEditor, viewerEmail }} />
          </AppLayout>
        </Frame>
      </PolarisProvider>
    </AppProvider>
  );
}
