import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration, useLoaderData,
} from "react-router";

import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import "./app.css";

import AppLayout from "./components/layout/AppLayout";

export const loader = async () => {
  return { apiKey: import.meta.env.SHOPIFY_API_KEY };
};

export default function Root() {

  const { apiKey } = useLoaderData();

  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="shopify-api-key" content={apiKey} />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <Meta />
        <Links />
      </head>
      <body>

        <AppProvider i18n={{}}>
            <Outlet />
        </AppProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
