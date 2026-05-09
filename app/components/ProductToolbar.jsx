import { TextField, InlineStack, Button, BlockStack, Select } from '@shopify/polaris';

const STATUS_LABELS = { ALL: "Alle", ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };

export default function ProductToolbar({
  query, setQuery,
  statusFilter, setStatusFilter,
  isCreating, onCreate,
  collections, collectionFilter, setCollectionFilter,
  allTags, tagFilter, setTagFilter,
  saleFilter, setSaleFilter,
  lowStockFilter, setLowStockFilter,
  shop, onExport
}) {
  const collectionOptions = [
    { label: "Alle Collections", value: "" },
    { label: "Ohne Collection", value: "NONE" },
    ...(collections ?? []).map(c => ({ label: c.title, value: c.id })),
  ];

  const tagOptions = [
    { label: "Alle Tags", value: "" },
    { label: "Ohne Tag", value: "NONE" },
    ...allTags.map(t => ({ label: t, value: t })),
  ];

  return (
    <BlockStack gap="200">

      {/* Zeile 1: Suche + Buttons */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <TextField label="Suche" labelHidden placeholder="Produkte suchen..." value={query} onChange={setQuery} autoComplete="off" />
        </div>
        <Button loading={isCreating} onClick={onCreate}>Produkt erstellen 🚀</Button>
        <Button onClick={onExport}>Export CSV 📥</Button>
      </div>

      {/* Zeile 2: Status + Collection + Tag + Sale + LowStock + Verwalten */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>

        {/* Status Buttons */}
        <InlineStack gap="100">
          {["ALL", "ACTIVE", "DRAFT", "ARCHIVED"].map(status => (
            <Button key={status} pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {STATUS_LABELS[status]}
            </Button>
          ))}
        </InlineStack>

        {/* Collection */}
        <div style={{ minWidth: 160 }}>
          <Select
            label="" labelHidden
            options={collectionOptions}
            value={collectionFilter ?? ""}
            onChange={(val) => setCollectionFilter(val === "" ? null : val)}
          />
        </div>

        {/* Tag */}
        <div style={{ minWidth: 140 }}>
          <Select
            label="" labelHidden
            options={tagOptions}
            value={tagFilter ?? ""}
            onChange={(val) => setTagFilter(val === "" ? null : val)}
          />
        </div>

        {/* Sale Filter */}
        <Button
          pressed={saleFilter}
          onClick={() => setSaleFilter(prev => !prev)}
        >
          🏷 Sale
        </Button>

        {/* Low Stock Filter */}
        <Button
          pressed={lowStockFilter}
          onClick={() => setLowStockFilter(prev => !prev)}
        >
          ⚠ Kein Lagerbestand
        </Button>

        {/* Collections verwalten */}
        <Button
          onClick={() => {
            const storeName = shop.replace(".myshopify.com", "");
            window.open(`https://admin.shopify.com/store/${storeName}/collections`, "_blank");
          }}
        >
          Collections verwalten ↗
        </Button>

      </div>

    </BlockStack>
  );
}