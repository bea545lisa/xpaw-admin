import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import "./app.css";

import AppLayout from "./components/layout/AppLayout";

export default function Root() {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body>

        <AppProvider i18n={{}}>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </AppProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
