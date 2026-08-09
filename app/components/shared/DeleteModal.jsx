import { Modal, Text } from "@shopify/polaris";

export default function DeleteModal({ open, onClose, title, onDelete, isDeleting }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Löschen: ${title}`}
      primaryAction={{ content: "Löschen", destructive: true, onAction: onDelete, loading: isDeleting }}
      secondaryActions={[{ content: "Abbrechen", onAction: onClose }]}
    >
      <Modal.Section>
        <Text>Wirklich löschen: <strong>{title}</strong>?</Text>
      </Modal.Section>
    </Modal>
  );
}
