import { authenticate } from "../shopify.server";
import {
  handleCreate, handleUpdate, handleDelete, handleBulkDelete,
  handleUpdateStatus, handleUpdateTitle, handleUpdateTags, handleDuplicate,
} from "./handlers/product.update.server";
import {
  handleUploadImage, handleReorderImages, handleDeleteImage,
} from "./handlers/product.images.server";
import {
  handleSearchCollections, handleGetProductCollections,
  handleAddToCollection, handleRemoveFromCollection,
} from "./handlers/product.collections.server";
import {
  handleGetMetafields, handleSaveMetafield, handleDeleteMetafield,
} from "./handlers/product.meta.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const services = await import("../services/product.server");
  const formData = await request.formData();
  const type = formData.get("action");

  switch (type) {
    case "create":             return handleCreate(admin, services);
    case "update":             return handleUpdate(admin, formData, services);
    case "delete":             return handleDelete(admin, formData, services);
    case "bulkDelete":         return handleBulkDelete(admin, formData);
    case "updateStatus":       return handleUpdateStatus(admin, formData, services);
    case "updateTitle":        return handleUpdateTitle(admin, formData);
    case "updateTags":         return handleUpdateTags(admin, formData);
    case "duplicate":          return handleDuplicate(admin, formData);
    case "uploadImage":        return handleUploadImage(admin, formData);
    case "reorderImages":      return handleReorderImages(admin, formData);
    case "deleteImage":        return handleDeleteImage(admin, formData);
    case "getMetafields":      return handleGetMetafields(admin, formData, services);
    case "saveMetafield":      return handleSaveMetafield(admin, formData);
    case "deleteMetafield":    return handleDeleteMetafield(admin, formData);
    case "searchCollections":  return handleSearchCollections(admin, formData);
    case "getProductCollections": return handleGetProductCollections(admin, formData);
    case "addToCollection":    return handleAddToCollection(admin, formData);
    case "removeFromCollection": return handleRemoveFromCollection(admin, formData);
    default:                   return null;
  }
};