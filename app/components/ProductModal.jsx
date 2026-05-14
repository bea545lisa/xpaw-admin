import { Modal, TextField, Text, BlockStack, Divider } from "@shopify/polaris";
import { useImageUpload } from "../hooks/useImageUpload.jsx";
import { useCollections } from "../hooks/useCollections.js";
import ImagesSection from "./shared/ImagesSection.jsx";
import CollectionsTagsSection from "./modal/CollectionsTagsSection.jsx";
import VariantsSection from "./modal/VariantsSection.jsx";

export default function ProductModal({
  // EDIT
  modalOpen, setModalOpen,
  editValue, setEditValue,
  editDescription, setEditDescription,
  handleUpdate, isUpdating,
  // VARIANTEN
  variants, setEditVariants,
  editOptions, setEditOptions,
  // TAGS
  initialTags, allTags,
  // DELETE
  deleteModalOpen, setDeleteModalOpen,
  deleteTitle, handleDelete, isDeleting,
  // UPLOAD
  productId, setLocalProducts, setToast,
}) {
  const imageUpload = useImageUpload({ productId, setLocalProducts, setToast });
  const collections = useCollections({ productId, setLocalProducts });

  return (
    <>
      {/* EDIT MODAL */}
      <Modal
        open={modalOpen}
        onClose={() => { if (modalOpen) setModalOpen(false); }}
        title="Produkt bearbeiten"
        size="large"
        accessibilityLabel="Produkt bearbeiten Modal"
        primaryAction={{
          content: isUpdating ? "Speichere…" : "Speichern",
          onAction: () => { if (!isUpdating) handleUpdate(); },
          loading: isUpdating,
          disabled: isUpdating,
        }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            <BlockStack gap="400">

              {/* Titel + Beschreibung */}
              <TextField label="Titel" value={editValue} onChange={setEditValue} autoComplete="off" />
              <TextField
                label="Beschreibung" multiline={4} autoComplete="off"
                value={editDescription ?? ""}
                onChange={setEditDescription}
              />
            </BlockStack>

            {/* Bilder */}
            <ImagesSection
              localImages={imageUpload.localImages}
              setLocalImages={imageUpload.setLocalImages}
              uploadingImage={imageUpload.uploadingImage}
              uploadProgress={imageUpload.uploadProgress}
              uploadError={imageUpload.uploadError}
              setUploadError={imageUpload.setUploadError}
              fileInputRef={imageUpload.fileInputRef}
              handleImagesUpload={imageUpload.handleImagesUpload}
              reorderImages={imageUpload.reorderImages}
              deleteImage={imageUpload.deleteImage}
            />
          </div>

          <div style={{ marginTop: 24 }}>

            {/* Collections & Tags */}
            <Divider />
            <CollectionsTagsSection
              productId={productId}
              setLocalProducts={setLocalProducts}
              initialTags={initialTags}
              allTags={allTags}
              modalOpen={modalOpen}
              productCollections={collections.productCollections}
              searchResults={collections.searchResults}
              searchQuery={collections.searchQuery}
              isSearchOpen={collections.isSearchOpen}
              setIsSearchOpen={collections.setIsSearchOpen}
              handleSearch={collections.handleSearch}
              handleSearchFocus={collections.handleSearchFocus}
              addToCollection={collections.addToCollection}
              removeFromCollection={collections.removeFromCollection}
              isSearching={collections.isSearching}
            />

            {/* Varianten & Optionen */}
            <VariantsSection
              variants={variants}
              editOptions={editOptions}
              setEditOptions={setEditOptions}
              setEditVariants={setEditVariants}
              localImages={imageUpload.localImages}
            />
          </div>
        </Modal.Section>
      </Modal>

      {/* DELETE MODAL */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={deleteTitle}
        accessibilityLabel={`Löschen von ${deleteTitle}`}
        primaryAction={{ content: "Löschen", destructive: true, onAction: handleDelete, loading: isDeleting }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <Text>Wirklich löschen: <strong>{deleteTitle}</strong>?</Text>
        </Modal.Section>
      </Modal>
    </>
  );
}
