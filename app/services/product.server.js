export async function getProducts(admin, { cursor, direction, limit }) {

  const isForward = direction === "after";

  const query = `
    query getProducts($cursor: String, $limit: Int!) {
      products(
        ${isForward ? "first: $limit, after: $cursor" : "last: $limit, before: $cursor"}
      ) {
        edges {
          cursor
          node {
            id
            title
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  `;

  const variables = {
    limit,
    cursor: cursor || null,
  };

  // ✅ ERST request machen
  const response = await admin.graphql(query, { variables });

  // ✅ DANN json lesen
  const json = await response.json();

  // 🔥 ABSICHERUNG
  if (!json.data || !json.data.products) {
    console.error("INVALID RESPONSE", json);

    return {
      products: [],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  return {
    products: json.data.products.edges,
    pageInfo: json.data.products.pageInfo,
  };
}

export async function getAllProducts(admin) {
  let all = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const result = await getProducts(admin, { cursor, direction: "after", limit: 50 });
    all = [...all, ...result.products];
    hasMore = result.pageInfo.hasNextPage;
    cursor = result.pageInfo.endCursor;
  }

  return all;
}

export async function createProduct(admin) {
  const art = ["Shirt", "Hoodie", "Pants", "Boots", "Cap"];
  const adjectives = ["Schneller", "Goldener", "Mystischer", "Schöner", "Wilder", "Cooler"];
  const nouns = ["Leopard", "Drachen", "Jaguar", "Tervueren", "Löwe", "Tiger"];
  const randomTitle = `${art[Math.floor(Math.random() * art.length)]} ${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]} *** NEU ***`;

  const res = await admin.graphql(`
    mutation createProduct($title: String!) {
      productCreate(input: { title: $title, status: DRAFT }) {
        product { id title status createdAt updatedAt }
      }
    }
  `, { variables: { title: randomTitle } });

  const data = await res.json();
  return data.data.productCreate.product;
}

export async function updateProduct(admin, id, title) {
  const res = await admin.graphql(
    `mutation ($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title createdAt updatedAt }
      }
    }`,
    { variables: { input: { id, title } } }
  );
  const data = await res.json();
  return data.data.productUpdate.product;
}

export async function deleteProduct(admin, id) {
  await admin.graphql(
    `mutation ($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
      }
    }`,
    { variables: { input: { id } } }
  );
  return id;
}

export async function updateProductStatus(admin, id, status) {
  const res = await admin.graphql(`
    mutation updateStatus($id: ID!, $status: ProductStatus!) {
      productUpdate(input: { id: $id, status: $status }) {
        product { id title status }
      }
    }
  `, { variables: { id, status } });
  const data = await res.json();
  return data.data.productUpdate.product;
}

export async function getProductMetafields(admin, productId) {
  const res = await admin.graphql(`
    query getMetafields($id: ID!) {
      product(id: $id) {
        metafields(first: 20) {
          edges {
            node {
              id
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  `, { variables: { id: productId } });
  const data = await res.json();
  return data.data.product.metafields.edges.map(e => e.node);
}

export async function updateVariantPrice(admin, productId, variantId, price) {
  const res = await admin.graphql(`
    mutation updatePrice($variants: [ProductVariantsBulkInput!]!, $productId: ID!) {
      productVariantsBulkUpdate(variants: $variants, productId: $productId) {
        productVariants { id price }
        userErrors { field message }
      }
    }
  `, { variables: {
    productId,
    variants: [{ id: variantId, price: String(price) }]
  }});
  const data = await res.json();
  return data.data.productVariantsBulkUpdate.productVariants[0];
}

export async function setVariantInventory(admin, inventoryItemId, locationId, quantity) {
  const res = await admin.graphql(`
    mutation setInventory($inventoryItemId: ID!, $locationId: ID!, $quantity: Int!) {
      inventorySetQuantities(
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [{
            inventoryItemId: $inventoryItemId,
            locationId: $locationId,
            quantity: $quantity
          }]
        }
      ) {
        inventoryAdjustmentGroup { reason }
        userErrors { field message }
      }
    }
  `, { variables: { inventoryItemId, locationId, quantity: Number(quantity) } });
  const data = await res.json();
  return data;
}

export async function updateProductOptions(admin, productId, options) {
  const currentRes = await admin.graphql(`
    query($id: ID!) {
      product(id: $id) {
        options { id name values optionValues { id name } }
      }
    }
  `, { variables: { id: productId } });
  const currentJson = await currentRes.json();
  const currentOptions = currentJson.data?.product?.options ?? [];

  for (const option of options) {
    if (option.id) {
      const currentOption = currentOptions.find((current) => current.id === option.id);
      const existingValues = currentOption?.optionValues ?? [];
      const nextValues = Array.isArray(option.values) ? option.values : [];
      const existingByIndex = existingValues.slice(0, nextValues.length);
      const valuesToAdd = nextValues.slice(existingValues.length).map((name) => ({ name }));
      const valuesToUpdate = existingByIndex
        .map((value, index) => ({
          value,
          nextName: nextValues[index],
        }))
        .filter(({ value, nextName }) => nextName && nextName !== value.name)
        .map(({ value, nextName }) => ({
          id: value.id,
          name: nextName,
        }));
      const valuesToDelete = existingValues
        .slice(nextValues.length)
        .map((value) => value.id);

      await admin.graphql(`
        mutation updateOption(
          $productId: ID!,
          $option: OptionUpdateInput!,
          $optionValuesToAdd: [OptionValueCreateInput!],
          $optionValuesToUpdate: [OptionValueUpdateInput!],
          $optionValuesToDelete: [ID!],
          $variantStrategy: ProductOptionUpdateVariantStrategy
        ) {
          productOptionUpdate(
            productId: $productId,
            option: $option,
            optionValuesToAdd: $optionValuesToAdd,
            optionValuesToUpdate: $optionValuesToUpdate,
            optionValuesToDelete: $optionValuesToDelete,
            variantStrategy: $variantStrategy
          ) {
            product { id options { id name values optionValues { id name } } }
            userErrors { field message code }
          }
        }
      `, { variables: {
        productId,
        option: { id: option.id, name: option.name },
        optionValuesToAdd: valuesToAdd,
        optionValuesToUpdate: valuesToUpdate,
        optionValuesToDelete: valuesToDelete,
        variantStrategy: (valuesToAdd.length > 0 || valuesToDelete.length > 0) ? "MANAGE" : "LEAVE_AS_IS",
      }});

    }
    else {

      // Neue Option erstellen
      await admin.graphql(`
        mutation createOption($productId: ID!, $options: [OptionCreateInput!]!, $variantStrategy: ProductOptionCreateVariantStrategy) {
          productOptionsCreate(productId: $productId, options: $options, variantStrategy: $variantStrategy) {
            product { id options { id name values } }
            userErrors { field message }
          }
        }
      `, { variables: {
        productId,
        options: [{ name: option.name, values: option.values.map(v => ({ name: v })) }],
        variantStrategy: "CREATE",
      }});
    }
  }

  // Optionen löschen die nicht mehr im Array sind
  const submittedIds = new Set(options.map((o) => o.id).filter(Boolean));
  const optionsToDelete = currentOptions
    .filter((o) => !submittedIds.has(o.id))
    .map((o) => o.id);

  if (optionsToDelete.length > 0) {
    await admin.graphql(`
  mutation($productId: ID!, $options: [ID!]!, $strategy: ProductOptionDeleteStrategy) {
    productOptionsDelete(
      productId: $productId,
      options: $options,
      strategy: $strategy
    ) {
      deletedOptionsIds
      userErrors { field message code }
    }
  }
`, {
      variables: {
        productId,
        options: optionsToDelete,
        strategy: "POSITION",
      },
    });
  }
}

// ================== BILDER UPLOAD ========================

export async function createStagedUpload(admin, filename, mimeType) {
  const res = await admin.graphql(`
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors { field message }
      }
    }
  `, {
    variables: {
      input: [{
        filename,
        mimeType,
        resource: "IMAGE",
        httpMethod: "POST",
      }]
    }
  });
  const data = await res.json();
  return data.data.stagedUploadsCreate.stagedTargets[0];
}

export async function addProductMedia(admin, productId, resourceUrl) {
  const res = await admin.graphql(`
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image { url }
          }
        }
        userErrors { field message }
      }
    }
  `, {
    variables: {
      productId,
      media: [{
        originalSource: resourceUrl,
        mediaContentType: "IMAGE",
      }]
    }
  });
  const data = await res.json();
  return data.data.productCreateMedia.media[0];
}

export async function reorderProductMedia(admin, productId, mediaIds) {
  const res = await admin.graphql(`
    mutation reorderMedia($id: ID!, $moves: [MoveInput!]!) {
      productReorderMedia(id: $id, moves: $moves) {
        job { id }
        userErrors { field message }
      }
    }
  `, {
    variables: {
      id: productId,
      moves: mediaIds.map((id, index) => ({ id, newPosition: String(index) })),
    }
  });
  const data = await res.json();
  return data.data.productReorderMedia;
}

export async function deleteProductMedia(admin, productId, mediaIds) {
  const res = await admin.graphql(`
    mutation deleteMedia($productId: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
        deletedMediaIds
        userErrors { field message }
      }
    }
  `, { variables: { productId, mediaIds } });
  const data = await res.json();
  return data.data.productDeleteMedia;
}

// ================== COLLECTIONS ========================

export async function searchCollections(admin, query) {
  const res = await admin.graphql(`
    query {
      collections(first: 250) {
        edges {
          node { id title image { url altText } }
        }
      }
    }
  `);
  const data = await res.json();
  const all = data.data.collections.edges.map(e => e.node);

  if (!query.trim()) return all.slice(0, 20);  // ← erste 20 ohne Suche

  return all.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase())
  );
}

export async function getProductCollections(admin, productId) {
  const res = await admin.graphql(`
    query getProductCollections($id: ID!) {
      product(id: $id) {
        collections(first: 50) {
          edges {
            node {
              id
              title
              image { url altText }
            }
          }
        }
      }
    }
  `, { variables: { id: productId } });
  const data = await res.json();
  return data.data.product.collections.edges.map(e => e.node);
}

export async function addProductToCollection(admin, productId, collectionId) {
  const res = await admin.graphql(`
    mutation addToCollection($collectionId: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $collectionId, productIds: $productIds) {
        collection { id title }
        userErrors { field message }
      }
    }
  `, { variables: { collectionId, productIds: [productId] } });
  const data = await res.json();
  return data.data.collectionAddProducts.collection;
}

export async function removeProductFromCollection(admin, productId, collectionId) {
  const res = await admin.graphql(`
    mutation removeFromCollection($collectionId: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $collectionId, productIds: $productIds) {
        job { id }
        userErrors { field message }
      }
    }
  `, { variables: { collectionId, productIds: [productId] } });
  const data = await res.json();
  return data.data.collectionRemoveProducts;
}


