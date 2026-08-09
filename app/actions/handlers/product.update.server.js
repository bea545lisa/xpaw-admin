export async function handleUpdate(admin, formData, services) {
  const { setVariantInventory, updateProductOptions } = services;

  const productId = formData.get("id");
  const description = formData.get("description") ?? "";

  // Titel + Beschreibung speichern
  await admin.graphql(`
    mutation($id: ID!, $title: String!, $descriptionHtml: String!) {
      productUpdate(input: { id: $id, title: $title, descriptionHtml: $descriptionHtml }) {
        product { id title createdAt updatedAt }
        userErrors { field message }
      }
    }
  `, { variables: { id: productId, title: formData.get("title"), descriptionHtml: description } });

  const refreshRes = await admin.graphql(`
    query($id: ID!) {
      product(id: $id) {
        variants(first: 50) {
          edges { node { id title price inventoryItem { id } } }
        }
      }
    }
  `, { variables: { id: productId } });

  const freshVariants = (await refreshRes.json()).data.product.variants.edges.map(e => e.node);
  const variantsToUpdate = JSON.parse(formData.get("variants") || "[]");
  const options = JSON.parse(formData.get("options") || "[]");
  const validOptions = options
    .map((option) => ({
      id: option.id || null,
      name: String(option.name ?? "").trim(),
      values: Array.isArray(option.values) ? option.values.map((value) => String(value).trim()).filter(Boolean) : [],
    }))
    .filter((option) => option.name && option.values.length > 0);

  const variantsToDelete = [];

  await Promise.all(freshVariants.map(async (fv) => {

    const inputVariant = variantsToUpdate.find((v) => v.id === fv.id) ?? variantsToUpdate.find((v) => v.title === fv.title);
    if (!inputVariant) {
      variantsToDelete.push(fv.id);
      return;
    }

    await admin.graphql(`
      mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        productId,
        variants: [{
          id: fv.id,
          price: inputVariant.price,
          compareAtPrice: inputVariant.compareAtPrice || null,
          barcode: inputVariant.barcode || null,
          inventoryItem: {
            sku: inputVariant.sku || "",
          }
        }]
      }
    });

    if (fv.inventoryItem?.id && inputVariant.inventoryQuantity !== undefined && inputVariant.inventoryQuantity !== null && inputVariant.inventoryQuantity !== "") {
      await setVariantInventory(admin, fv.inventoryItem.id, formData.get("locationId"), Number(inputVariant.inventoryQuantity));
    }

    if (inputVariant.imageId) {
      await admin.graphql(`
        mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id }
            userErrors { field message }
          }
        }
      `, { variables: { productId, variants: [{ id: fv.id, mediaId: inputVariant.imageId }] } });
    }

    await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: fv.id,
          namespace: "custom",
          key: "active",
          value: inputVariant.active === false ? "false" : "true",
          type: "single_line_text_field",
        }]
      }
    });
  }));

  if (variantsToDelete.length > 0) {
    await admin.graphql(`
      mutation($productId: ID!, $variantsIds: [ID!]!) {
        productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
          product { id }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        productId,
        variantsIds: variantsToDelete,
      },
    });
  }

  await updateProductOptions(admin, productId, validOptions);

  const productData = await admin.graphql(`
    query($id: ID!) {
      product(id: $id) {
        id title status createdAt updatedAt description tags
        metafields(first: 5) {
          edges { node { id namespace key value } }
        }
        collections(first: 10) {
          edges { node { id title } }
        }
        featuredImage { url altText }
        media(first: 10) {
          edges {
            node {
              id mediaContentType
              ... on MediaImage {
                image { url altText }
              }
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              id title price 
              compareAtPrice    
              barcode sku 
              inventoryQuantity
              image { id url altText }
              inventoryItem { id }
              selectedOptions { name value }
              metafields(first: 5, namespace: "custom") {
                edges { node { key value } }
              }
            }
          }
        }
        options { id name values optionValues { id name } }
      }
    }
  `, { variables: { id: productId } });
  
  const productJson = await productData.json();
  return Response.json({ ok: true, type: "update", product: productJson.data.product });
}

export async function handleCreate(admin, services) {
  const { createProduct } = services;
  return { ok: true, type: "create", product: await createProduct(admin) };
}

export async function handleDelete(admin, formData, services) {
  const { deleteProduct } = services;
  return { ok: true, type: "delete", id: await deleteProduct(admin, formData.get("id")) };
}

export async function handleBulkDelete(admin, formData) {
  const ids = JSON.parse(formData.get("ids") || "[]");
  await Promise.all(ids.map(id =>
    admin.graphql(
      `mutation($input: ProductDeleteInput!) {
        productDelete(input: $input) { deletedProductId }
      }`,
      { variables: { input: { id } } }
    )
  ));
  return { ok: true, type: "bulkDelete", ids };
}

export async function handleUpdateStatus(admin, formData, services) {
  const { updateProductStatus } = services;
  return {
    ok: true, type: "updateStatus",
    product: await updateProductStatus(admin, formData.get("id"), formData.get("status")),
  };
}

export async function handleUpdateTitle(admin, formData) {
  const res = await admin.graphql(`
    mutation($id: ID!, $title: String!) {
      productUpdate(input: { id: $id, title: $title }) {
        product { id title createdAt updatedAt }
        userErrors { field message }
      }
    }
  `, { variables: { id: formData.get("id"), title: formData.get("title") } });
  const data = await res.json();
  return Response.json({ ok: true, type: "updateTitle", product: data.data.productUpdate.product });
}

export async function handleUpdateTags(admin, formData) {
  const res = await admin.graphql(`
    mutation($id: ID!, $tags: [String!]!) {
      productUpdate(input: { id: $id, tags: $tags }) {
        product { id title createdAt updatedAt tags }
        userErrors { field message }
      }
    }
  `, { variables: { id: formData.get("id"), tags: JSON.parse(formData.get("tags")) } });
  const data = await res.json();
  return Response.json({ ok: true, type: "updateTags", product: data.data.productUpdate.product });
}

export async function handleDuplicate(admin, formData) {
  const sourceTitle = String(formData.get("title") ?? "").trim();
  const duplicatedTitle = `${sourceTitle} *** KOPIE ***`;
  const res = await admin.graphql(`
    mutation($productId: ID!, $newTitle: String!) {
      productDuplicate(productId: $productId, newTitle: $newTitle, includeImages: true) {
        newProduct {
          id title status
          featuredImage { url altText }
          variants(first: 50) {
            edges {
              node {
                id title price inventoryQuantity
                inventoryItem { id }
                selectedOptions { name value }
              }
            }
          }
          options { id name values optionValues { id name } }
          media(first: 10) {
            edges {
              node {
                id
                ... on MediaImage {
                  image { id url altText }
                }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `, {
    variables: {
      productId: formData.get("id"),
      newTitle: duplicatedTitle,
    }
  });
  const data = await res.json();
  const duplicatedProduct = data?.data?.productDuplicate?.newProduct;
  if (!duplicatedProduct?.id) {
    return Response.json({
      ok: false,
      type: "duplicate",
      error: data?.data?.productDuplicate?.userErrors?.[0]?.message ?? "Duplikat konnte nicht erstellt werden.",
    }, { status: 400 });
  }

  let finalTitle = duplicatedProduct.title ?? duplicatedTitle;

  if (finalTitle !== duplicatedTitle) {
    const updateRes = await admin.graphql(`
      mutation($id: ID!, $title: String!) {
        productUpdate(input: { id: $id, title: $title }) {
          product { id title status createdAt updatedAt }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        id: duplicatedProduct.id,
        title: duplicatedTitle,
      },
    });

    const updateJson = await updateRes.json();
    finalTitle = updateJson?.data?.productUpdate?.product?.title ?? duplicatedTitle;
  }

  return { ok: true, type: "duplicate", product: { ...duplicatedProduct, title: finalTitle } };
}
