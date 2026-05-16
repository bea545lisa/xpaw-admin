import { Outlet, useLoaderData, useNavigate } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { Frame } from "@shopify/polaris";
import AppLayout from "../components/layout/AppLayout";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

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
