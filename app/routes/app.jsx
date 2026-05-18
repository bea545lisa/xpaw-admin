import { Outlet, useLoaderData, useNavigate } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { Frame } from "@shopify/polaris";
import AppLayout from "../components/layout/AppLayout";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

// Verhindert, dass der Parent-Loader bei jeder Client-Navigation neu ausgeführt
// wird. authenticate.admin verbraucht dabei den einmaligen JWT-Token, wodurch
// der Kind-Loader keinen gültigen Token mehr vorfindet und hängt.
export function shouldRevalidate() {
  return false;
}

export default function App() {
  const { apiKey } = useLoaderData();
  const navigate = useNavigate();

  const router = {
    history: {
      push: (path) => navigate(path),
      replace: (path) => navigate(path, { replace: true }),
    },
  };

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <Frame router={router}>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </Frame>
    </AppProvider>
  );
}
