import React from "react";
import { Card, BlockStack, Text, Button, InlineStack } from "@shopify/polaris";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <BlockStack gap="400" inlineAlign="center">
            <Text variant="headingMd" tone="critical">⚠ Etwas ist schiefgelaufen</Text>
            <Text tone="subdued">{this.state.error?.message ?? "Unbekannter Fehler"}</Text>
            <InlineStack gap="200">
              <Button onClick={() => this.setState({ hasError: false, error: null })}>
                Erneut versuchen
              </Button>
              <Button onClick={() => window.location.reload()}>
                Seite neu laden
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      );
    }
    return this.props.children;
  }
}
