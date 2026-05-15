import { Outlet, useLoaderData  } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { Frame } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
          <Outlet />
    </AppProvider>
  );
}
