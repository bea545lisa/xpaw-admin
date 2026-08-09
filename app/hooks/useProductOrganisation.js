import { useState, useRef, useMemo } from "react";

export function useProductOrganisation({ product, allVendors, allProductTypes, fetcher }) {
  const [organizationDraft, setOrganizationDraft] = useState({
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
  });
  const [organizationDirty, setOrganizationDirty] = useState(false);
  const [showVendorSearch, setShowVendorSearch] = useState(false);
  const [showTypeSearch, setShowTypeSearch] = useState(false);
  const vendorInputRef = useRef(null);
  const typeInputRef = useRef(null);

  const isOrganizationSaving = fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateOrganization";

  const vendorSuggestions = useMemo(() =>
      organizationDraft.vendor.length > 0
        ? allVendors.filter((v) => v.toLowerCase().includes(organizationDraft.vendor.toLowerCase())).slice(0, 8)
        : allVendors.slice(0, 8),
    [allVendors, organizationDraft.vendor]);

  const productTypeSuggestions = useMemo(() =>
      organizationDraft.productType.length > 0
        ? allProductTypes.filter((v) => v.toLowerCase().includes(organizationDraft.productType.toLowerCase())).slice(0, 8)
        : allProductTypes.slice(0, 8),
    [allProductTypes, organizationDraft.productType]);

  const handleOrganizationSave = () => {
    fetcher.submit(
      { action: "updateOrganization", id: product.id, vendor: organizationDraft.vendor, productType: organizationDraft.productType },
      { method: "POST" }
    );
    setOrganizationDirty(false);
  };

  return {
    organizationDraft, setOrganizationDraft,
    organizationDirty, setOrganizationDirty,
    showVendorSearch, setShowVendorSearch,
    showTypeSearch, setShowTypeSearch,
    vendorInputRef, typeInputRef,
    vendorSuggestions, productTypeSuggestions,
    isOrganizationSaving, handleOrganizationSave,
  };
}
