import { useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme } from "../context/ColorSchemeContext.js";
import { createPortal } from "react-dom";
import { BlockStack, Button, ChoiceList, InlineStack, Select } from "@shopify/polaris";
import { ArrowDownIcon, ArrowUpIcon, DeleteIcon, SearchIcon } from "@shopify/polaris-icons";

const STATUS_LABELS = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
const OPERATOR_OPTIONS = [
  { label: "enthält", value: "is" },
  { label: "enthält nicht", value: "isNot" },
];
const SORT_OPTIONS = [
  { label: "Erstellt", value: "createdAt" },
  { label: "Aktualisiert", value: "updatedAt" },
  { label: "Titel", value: "title" },
  { label: "Preis", value: "price" },
];

function getOptionLabel(options, value) {
  return options.find((o) => o.value === value)?.label ?? value;
}

function FilterPill({ title, operator, value, onClick, onRemove }) {
  return (
    <button type="button" className="toolbar-pill" onClick={onClick}>
      <span className="toolbar-pill-title">{title}</span>
      <span className="toolbar-pill-operator">{operator}</span>
      <span className="toolbar-pill-value">{value}</span>
      <span
        role="button"
        tabIndex={0}
        className="toolbar-pill-remove"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }
        }}
        aria-label={`${title} entfernen`}
      >
        ×
      </span>
    </button>
  );
}

export default function ProductToolbar({
  query, setQuery,
  statusFilter, setStatusFilter,
  isCreating, onCreate,
  collections, collectionFilter, setCollectionFilter,
  allTags, tagFilter, setTagFilter,
  variantFilter, setVariantFilter,
  optionValueFilter, setOptionValueFilter, allOptionValues,
  saleFilter, setSaleFilter,
  lowStockFilter, setLowStockFilter,
  noImagesFilter, setNoImagesFilter,
  noTranslationFilter, setNoTranslationFilter,
  metafieldFilter, setMetafieldFilter, allMetafieldOptions,
  onExport,
  sortBy, setSortBy,
  sortDirection, setSortDirection,
  onImport,
  onMoreActions,
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeEditor, setActiveEditor] = useState("status");
  const [overlayPosition, setOverlayPosition] = useState({ left: 8, top: 46 });
  const [isFilterBarActive, setIsFilterBarActive] = useState(false);
  const toolbarShellRef = useRef(null);
  const toolbarFilterRef = useRef(null);
  const overlayRef = useRef(null);

  const collectionOptions = useMemo(
    () => [{ label: "Ohne Collection", value: "NONE" }, ...(collections ?? []).map((c) => ({ label: c.title, value: c.id }))],
    [collections],
  );
  const tagOptions = useMemo(
    () => [{ label: "Ohne Tag", value: "NONE" }, ...allTags.map((t) => ({ label: t, value: t }))],
    [allTags],
  );
  const metafieldOptions = useMemo(() => allMetafieldOptions ?? [], [allMetafieldOptions]);
  const optionValueOptions = useMemo(() => allOptionValues ?? [], [allOptionValues]);
  const variantOptions = useMemo(
    () => [
      { label: "Ohne Optionen", value: "NO_OPTIONS" },
      { label: "1 Option", value: "ONE_OPTION" },
      { label: "2 Optionen", value: "TWO_OPTIONS" },
    ],
    [],
  );

  const resetAllFilters = () => {
    setQuery("");
    setStatusFilter({ operator: "is", values: [] });
    setCollectionFilter({ operator: "is", values: [] });
    setTagFilter({ operator: "is", values: [] });
    setVariantFilter({ operator: "is", values: [] });
    setOptionValueFilter?.({ operator: "is", values: [] });
    setSaleFilter(false);
    setLowStockFilter(false);
    setNoImagesFilter?.(false);
    setNoTranslationFilter?.(false);
    setMetafieldFilter?.({ operator: "is", values: [] });
    setActiveEditor("status");
  };

  const closeOverlay = () => {
    setOverlayOpen(false);
    setIsFilterBarActive(false);
  };

  const openOverlay = (editor, anchorElement) => {
    if (editor) {
      setActiveEditor(editor);
    }

    const anchorRect = anchorElement?.getBoundingClientRect();
    if (anchorRect) {
      setOverlayPosition({
        left: Math.max(8, anchorRect.left),
        top: anchorRect.bottom + 8,
      });
    }

    setOverlayOpen(true);
    setIsFilterBarActive(true);
  };

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!overlayOpen) return;
      const target = event.target;
      const shell = toolbarShellRef.current;
      const overlay = overlayRef.current;
      if (shell?.contains(target) || overlay?.contains(target)) {
        return;
      }
      closeOverlay();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [overlayOpen]);

  const appliedFilters = [
    ...statusFilter.values.map((value) => ({
      key: `status-${value}`,
      type: "status",
      title: "Status",
      operator: statusFilter.operator === "isNot" ? "enthält nicht" : "enthält",
      value: STATUS_LABELS[value] ?? value,
      onRemove: () => setStatusFilter((prev) => ({ ...prev, values: prev.values.filter((v) => v !== value) })),
    })),
    ...collectionFilter.values.map((value) => ({
      key: `collection-${value}`,
      type: "collection",
      title: "Collection",
      operator: collectionFilter.operator === "isNot" ? "enthält nicht" : "enthält",
      value: getOptionLabel(collectionOptions, value),
      onRemove: () => setCollectionFilter((prev) => ({ ...prev, values: prev.values.filter((v) => v !== value) })),
    })),
    ...tagFilter.values.map((value) => ({
      key: `tag-${value}`,
      type: "tag",
      title: "Tag",
      operator: tagFilter.operator === "isNot" ? "enthält nicht" : "enthält",
      value: getOptionLabel(tagOptions, value),
      onRemove: () => setTagFilter((prev) => ({ ...prev, values: prev.values.filter((v) => v !== value) })),
    })),
    ...variantFilter.values.map((value) => ({
      key: `variant-${value}`,
      type: "variant",
      title: "Varianten",
      operator: variantFilter.operator === "isNot" ? "enthält nicht" : "enthält",
      value: getOptionLabel(variantOptions, value),
      onRemove: () => setVariantFilter((prev) => ({ ...prev, values: prev.values.filter((v) => v !== value) })),
    })),
    ...(saleFilter ? [{ key: "sale", type: "sale", title: "Sale", operator: "ist", value: "aktiv", onRemove: () => setSaleFilter(false) }] : []),
    ...(lowStockFilter ? [{ key: "lowStock", type: "lowStock", title: "Lagerbestand", operator: "ist", value: "leer", onRemove: () => setLowStockFilter(false) }] : []),
    ...(noImagesFilter ? [{ key: "noImages", type: "noImages", title: "Bilder", operator: "ist", value: "fehlend", onRemove: () => setNoImagesFilter?.(false) }] : []),
    ...(noTranslationFilter ? [{ key: "noTranslation", type: "translation", title: "Übersetzung", operator: "ist", value: "fehlend", onRemove: () => setNoTranslationFilter?.(false) }] : []),
    ...metafieldFilter.values.map((value) => ({
      key: `metafield-${value}`,
      type: "metafield",
      title: "Eigenschaften",
      operator: metafieldFilter.operator === "isNot" ? "enthält nicht" : "enthält",
      value: getOptionLabel(metafieldOptions, value),
      onRemove: () => setMetafieldFilter((prev) => ({ ...prev, values: prev.values.filter((v) => v !== value) })),
    })),
    ...optionValueFilter.values.map((value) => ({
      key: `optionValue-${value}`,
      type: "optionValue",
      title: "Variantenwerte",
      operator: optionValueFilter.operator === "isNot" ? "enthält nicht" : "enthält",
      value: getOptionLabel(optionValueOptions, value),
      onRemove: () => setOptionValueFilter((prev) => ({ ...prev, values: prev.values.filter((v) => v !== value) })),
    })),
  ];

  const hasAnyFilter =
    Boolean(query?.trim()) ||
    statusFilter.values.length > 0 ||
    collectionFilter.values.length > 0 ||
    tagFilter.values.length > 0 ||
    variantFilter.values.length > 0 ||
    saleFilter ||
    lowStockFilter ||
    noImagesFilter ||
    noTranslationFilter ||
    metafieldFilter.values.length > 0 ||
    optionValueFilter.values.length > 0;

  const renderEditor = () => {
    if (activeEditor === "status") {
      return (
        <div className="toolbar-editor-card">
          <Select
            label="Operator"
            options={OPERATOR_OPTIONS}
            value={statusFilter.operator}
            onChange={(value) => setStatusFilter((prev) => ({ ...prev, operator: value }))}
          />
          <ChoiceList
            title="Status"
            allowMultiple
            titleHidden
            choices={[
              { label: "Aktiv", value: "ACTIVE" },
              { label: "Entwurf", value: "DRAFT" },
              { label: "Archiviert", value: "ARCHIVED" },
            ]}
            selected={statusFilter.values}
            onChange={(values) => setStatusFilter((prev) => ({ ...prev, values }))}
          />
        </div>
      );
    }
    if (activeEditor === "collection") {
      return (
        <div className="toolbar-editor-card">
          <Select
            label="Operator"
            options={OPERATOR_OPTIONS}
            value={collectionFilter.operator}
            onChange={(value) => setCollectionFilter((prev) => ({ ...prev, operator: value }))}
          />
          <ChoiceList
            title="Collections"
            allowMultiple
            titleHidden
            choices={collectionOptions}
            selected={collectionFilter.values}
            onChange={(values) => setCollectionFilter((prev) => ({ ...prev, values }))}
          />
        </div>
      );
    }
    if (activeEditor === "variant") {
      return (
        <div className="toolbar-editor-card">
          <ChoiceList
            title="Varianten"
            allowMultiple
            titleHidden
            choices={variantOptions}
            selected={variantFilter.values}
            onChange={(values) => setVariantFilter((prev) => ({ ...prev, values }))}
          />
          <Select
            label="Operator"
            options={OPERATOR_OPTIONS}
            value={optionValueFilter.operator}
            onChange={(value) => setOptionValueFilter((prev) => ({ ...prev, operator: value }))}
          />
          <ChoiceList
            title="Optionswerte"
            allowMultiple
            choices={optionValueOptions}
            selected={optionValueFilter.values}
            onChange={(values) => setOptionValueFilter((prev) => ({ ...prev, values }))}
          />
        </div>
      );
    }
    if (activeEditor === "metafield") {
      return (
        <div className="toolbar-editor-card">
          <Select
            label="Operator"
            options={OPERATOR_OPTIONS}
            value={metafieldFilter.operator}
            onChange={(value) => setMetafieldFilter((prev) => ({ ...prev, operator: value }))}
          />
          <ChoiceList
            title="Eigenschaften"
            allowMultiple
            titleHidden
            choices={metafieldOptions}
            selected={metafieldFilter.values}
            onChange={(values) => setMetafieldFilter((prev) => ({ ...prev, values }))}
          />
        </div>
      );
    }
    return (
      <div className="toolbar-editor-card">
        <Select
          label="Operator"
          options={OPERATOR_OPTIONS}
          value={tagFilter.operator}
          onChange={(value) => setTagFilter((prev) => ({ ...prev, operator: value }))}
        />
        <ChoiceList
          title="Tags"
          allowMultiple
          titleHidden
          choices={tagOptions}
          selected={tagFilter.values}
          onChange={(values) => setTagFilter((prev) => ({ ...prev, values }))}
        />
      </div>
    );
  };

  return (
    <BlockStack gap="300">
      <div className="toolbar-actions-row">
        <InlineStack gap="200" align="end" blockAlign="center" wrap>
          <div className="toolbar-control toolbar-control-button"><Button variant="primary" loading={isCreating} onClick={onCreate}>Produkt hinzufügen</Button></div>
          <div className="toolbar-control toolbar-control-button"><Button onClick={onExport}>Exportieren</Button></div>
          <div className="toolbar-control toolbar-control-button"><Button onClick={onImport}>Importieren</Button></div>
          <div className="toolbar-control toolbar-control-button"><Button onClick={onMoreActions}>Weitere Aktionen</Button></div>
        </InlineStack>
      </div>

      <div ref={toolbarShellRef} className="toolbar-filter-shell">
        <div className="toolbar-filter-row">
          <div
            ref={toolbarFilterRef}
            className={`toolbar-unified-search ${isFilterBarActive || overlayOpen ? "active" : ""}`}
            onClick={(event) => {
              setIsFilterBarActive(true);
              if (!overlayOpen) {
                openOverlay(activeEditor, event.currentTarget);
              }
            }}
            onFocusCapture={() => setIsFilterBarActive(true)}
          >
            <span className="toolbar-search-icon">
              <Button variant="plain" icon={SearchIcon} accessibilityLabel="Suchen" disabled />
            </span>
            <div className="toolbar-inline-content">
              {appliedFilters.map((f) => (
                <FilterPill
                  key={f.key}
                  title={f.title}
                  operator={f.operator}
                  value={f.value}
                  onClick={(event) => {
                    event.stopPropagation();
                    openOverlay(f.type, event.currentTarget);
                  }}
                  onRemove={f.onRemove}
                />
              ))}
              {hasAnyFilter && (
                <Button
                  className="toolbar-action-icon visible"
                  icon={DeleteIcon}
                  accessibilityLabel="Alle Filter löschen"
                  variant="plain"
                  onClick={(event) => {
                    event.stopPropagation();
                    resetAllFilters();
                  }}
                />
              )}
              <input
                className="toolbar-inline-input"
                aria-label="Suchen und filtern"
                placeholder={appliedFilters.length ? "" : "Suchen und filtern"}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  setIsFilterBarActive(true);
                  if (!overlayOpen) {
                    openOverlay("status", toolbarFilterRef.current);
                  }
                }}
              />
            </div>
          </div>

          <div className="toolbar-sort-wrap">
            <div className="toolbar-sort-controls">
              <div className="toolbar-control toolbar-control-select">
                <Select
                  label="Sortieren"
                  labelHidden
                  options={SORT_OPTIONS}
                  value={sortBy}
                  onChange={setSortBy}
                />
              </div>
              <Button
                className="toolbar-sort-toggle"
                variant="plain"
                icon={sortDirection === "ascending" ? ArrowUpIcon : ArrowDownIcon}
                accessibilityLabel="Sortierreihenfolge umdrehen"
                onClick={() => setSortDirection((prev) => (prev === "ascending" ? "descending" : "ascending"))}
              />
            </div>
          </div>
        </div>

        {overlayOpen && typeof document !== "undefined" && createPortal(
          <div
            ref={overlayRef}
            className="toolbar-editor-overlay"
            style={{ left: overlayPosition.left, top: overlayPosition.top }}
          >
            <div className="toolbar-editor-categories">
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "status" ? "active" : ""}`} onClick={() => setActiveEditor("status")}>Status</button>
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "tag" ? "active" : ""}`} onClick={() => setActiveEditor("tag")}>Tags</button>
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "variant" ? "active" : ""}`} onClick={() => setActiveEditor("variant")}>Varianten</button>
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "collection" ? "active" : ""}`} onClick={() => setActiveEditor("collection")}>Collections</button>
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "sale" ? "active" : ""}`} onClick={() => setActiveEditor("sale")}>Sale</button>
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "stock" ? "active" : ""}`} onClick={() => setActiveEditor("stock")}>Lagerbestand</button>
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "translation" ? "active" : ""}`} onClick={() => setActiveEditor("translation")}>Übersetzung</button>
              <button type="button" className={`toolbar-editor-tab ${activeEditor === "metafield" ? "active" : ""}`} onClick={() => setActiveEditor("metafield")}>Eigenschaften</button>
            </div>
            <div className="toolbar-editor-content">
              <div className="toolbar-editor-content-body">
                {activeEditor === "sale" ? (
                  <ChoiceList
                    title="Sale"
                    titleHidden
                    choices={[{ label: "Nur Sale-Produkte", value: "sale" }]}
                    selected={saleFilter ? ["sale"] : []}
                    onChange={(values) => setSaleFilter(values.includes("sale"))}
                  />
                ) : activeEditor === "translation" ? (
                  <ChoiceList
                    title="Übersetzung"
                    titleHidden
                    choices={[{ label: "Nur ohne Übersetzung", value: "noTranslation" }]}
                    selected={noTranslationFilter ? ["noTranslation"] : []}
                    onChange={(values) => setNoTranslationFilter?.(values.includes("noTranslation"))}
                  />
                ) : activeEditor === "stock" ? (
                  <ChoiceList
                    title="Lagerbestand"
                    titleHidden
                    choices={[{ label: "Kein Lagerbestand", value: "none" }]}
                    selected={lowStockFilter ? ["none"] : []}
                    onChange={(values) => setLowStockFilter(values.includes("none"))}
                  />
                ) : (
                  renderEditor()
                )}
              </div>
              <div className="toolbar-overlay-footer">
                <Button variant="plain" onClick={resetAllFilters}>Alles löschen</Button>
                <Button onClick={closeOverlay}>Fertig</Button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      <style>{`
        .toolbar-actions-row { display: flex; justify-content: flex-end; }
        .toolbar-control { height: 40px; display: flex; align-items: stretch; }
        .toolbar-control :global(button), .toolbar-control :global(select), .toolbar-control :global(input) { height: 100%; }
        .toolbar-filter-shell { position: relative; border: 1px solid var(--p-color-border-subdued); border-radius: 10px; background: var(--p-color-bg-surface); }
        .toolbar-filter-row { display: flex; gap: 8px; align-items: center; padding: 8px; }
        .toolbar-unified-search { flex: 1; min-width: 260px; display: flex; align-items: center; gap: 4px; border: 1px solid var(--p-color-border); border-radius: 8px; padding: 0 8px; min-height: 40px; cursor: text; }
        .toolbar-unified-search.active { }
        .toolbar-search-icon :global(button) { min-width: 24px; padding: 0; }
        .toolbar-inline-content { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; width: 100%; }
        .toolbar-inline-input { border: 0; outline: 0; background: transparent; min-width: 140px; flex: 1; font-size: 14px; color: var(--p-color-text); line-height: 20px; }
        .toolbar-sort-wrap { min-width: 150px; }
        .toolbar-sort-controls { display: flex; align-items: stretch; gap: 0; }
        .toolbar-control-select { min-width: 140px; height: 40px; display: flex; align-items: stretch; --pg-control-height: 40px; }
        .toolbar-control-select :global(.Polaris-Select) { width: 100%; height: 100%; }
        .toolbar-control-select :global(.Polaris-Select__Content),
        .toolbar-control-select :global(.Polaris-Select__Input) {
          height: 100%;
          min-height: 40px;
          padding-top: 0;
          padding-bottom: 0;
        }
        .toolbar-sort-toggle { margin-left: -8px; }
        .toolbar-action-icon { display: none !important; width: 30px; height: 30px; min-width: 30px; padding: 0; border-radius: 999px; flex: 0 0 auto; border: 1px solid var(--p-color-border-subdued); background: var(--p-color-bg-surface-secondary); }
        .toolbar-action-icon.visible { display: inline-flex !important; }
        .toolbar-action-icon.visible:hover { background: var(--p-color-bg-fill-tertiary); }
        .toolbar-action-icon :global(.Polaris-Button__Icon) { margin: 0; }
        .toolbar-pill { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--p-color-border-subdued); background: var(--p-color-bg-surface-secondary); border-radius: 999px; padding: 3px 8px; font-size: 12px; cursor: pointer; white-space: nowrap; }
        .toolbar-pill-title { color: var(--p-color-text-subdued); }
        .toolbar-pill-operator { color: var(--p-color-text-subdued); padding: 0 2px; }
        .toolbar-pill-value { color: var(--p-color-text); font-weight: 600; background: var(--p-color-bg-fill-tertiary); border-radius: 999px; padding: 1px 6px; }
        .toolbar-pill-remove { width: 18px; height: 18px; min-width: 18px; border: 0; border-radius: 999px; background: var(--p-color-bg-surface); color: var(--p-color-text-subdued); display: inline-flex; align-items: center; justify-content: center; padding: 0; line-height: 1; opacity: 0; transition: opacity 120ms ease, background-color 120ms ease; }
        .toolbar-pill-remove:hover { background: var(--p-color-bg-fill-tertiary); }
        .toolbar-pill:hover .toolbar-pill-remove { opacity: 1; }
        .toolbar-editor-overlay { position: fixed; width: 540px; border: 1px solid var(--p-color-border-subdued); border-radius: 10px; background: var(--p-color-bg-surface); box-shadow: 0 10px 24px rgba(0,0,0,0.12); display: grid; grid-template-columns: 180px 1fr; z-index: 9999; }
        .toolbar-editor-categories { align-self: start; border-right: 1px solid var(--p-color-border-subdued); padding: 8px; display: grid; gap: 4px; }
        .toolbar-editor-tab { text-align: left; border: 0; background: transparent; border-radius: 6px; padding: 8px; cursor: pointer; font-size: 13px; color: var(--p-color-text-subdued); }
        .toolbar-editor-tab.active { background: var(--p-color-bg-fill-tertiary); color: var(--p-color-text); font-weight: 600; }
        .toolbar-editor-content { padding: 10px; display: flex; flex-direction: column; gap: 10px; min-width: 320px; }
        .toolbar-editor-content-body { flex: 1; min-height: 200px; max-height: 80vh; overflow: auto; }
        .toolbar-editor-card { display: grid; gap: 8px; }
        .toolbar-overlay-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--p-color-border-subdued); padding-top: 8px; }
        @media (max-width: 900px) {
          .toolbar-editor-overlay { width: calc(100% - 16px); left: 8px !important; right: 8px; grid-template-columns: 1fr; }
          .toolbar-editor-categories { border-right: 0; border-bottom: 1px solid var(--p-color-border-subdued); grid-auto-flow: column; overflow: auto; }
        }
      `}</style>
    </BlockStack>
  );
}
