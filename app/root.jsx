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
import "./styles/sidebar.css";
import { useState, useEffect, useCallback } from "react";
import { ColorSchemeContext } from "./context/ColorSchemeContext";

export const loader = async () => {
  return { apiKey: import.meta.env.SHOPIFY_API_KEY };
};

export default function Root() {
  const { apiKey } = useLoaderData();

  const LIGHT = "light";
  const DARK  = "dark-experimental";

  const [theme, setTheme] = useState(LIGHT);

  const isDark = theme === DARK;

  // localStorage erst nach Hydration lesen (kein SSR-Mismatch)
  useEffect(() => {
    const stored = localStorage.getItem("rexpaw_color_scheme");
    if (stored === DARK) setTheme(DARK);
  }, []);

  // data-theme auf <html> setzen → CSS-Selektoren greifen
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, [isDark]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === LIGHT ? DARK : LIGHT;
      localStorage.setItem("rexpaw_color_scheme", next);
      return next;
    });
  }, []);

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
        <ColorSchemeContext.Provider value={{ colorScheme: isDark ? "dark" : "light", toggle }}>
          <AppProvider i18n={{}} theme={theme}>
            <Outlet />
          </AppProvider>
        </ColorSchemeContext.Provider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
