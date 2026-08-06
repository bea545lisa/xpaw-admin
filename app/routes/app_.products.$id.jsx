import { useLoaderData, useNavigate, useLocation, useFetcher } from "react-router";
import AppLayout from "../components/layout/AppLayout";
import { useColorScheme } from "../context/ColorSchemeContext";
import { authenticate } from "../shopify.server";
import { SkeletonBodyText, SkeletonDisplayText, Layout, Card, BlockStack, Text, Badge, Modal, Toast, Icon, Button,} from "@shopify/polaris";
import { ArrowLeftIcon } from "@shopify/polaris-icons";
import { useEffect, useState } from "react";

import {
  updateProductOptions,
  createStagedUpload,
  addProductMedia,
  reorderProductMedia,
  deleteProductMedia,
} from "../services/product.server";

import { useProductOptions } from "../hooks/useProductOptions.js";
import { useVariantEdit } from "../hooks/useVariantEdit.js";
import { useImageUpload } from "../hooks/useImageUpload.jsx";

import { normalizeOptions } from "../utils/productOptions.js";
import { formatDate } from "../utils/dateFunctions.js";
import { getSkuFormat, getSkuAbbreviations, getMetafieldOrder, setMetafieldOrder } from "../services/settings.server";

import ProductDetailSeo from "../components/product/detail/ProductDetailSeo.jsx";
import ProductDetailDescription from "../components/product/detail/ProductDetailDescription.jsx";
import ProductDetailInfos from "../components/product/detail/ProductDetailInfos.jsx";
import ProductDetailOrganisation from "../components/product/detail/ProductDetailOrganisation.jsx";
import ProductDetailTabs from "../components/product/detail/ProductDetailTabs.jsx";

import ImagesSection from "../components/shared/ImagesSection.jsx";

// ─── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);
  const shop = requestUrl.searchParams.get("shop") || session.shop;

  const res = await admin.graphql(`
    query getProduct($id: ID!) {
      product(id: $id) {
        id title handle status description vendor productType createdAt updatedAt tags
        onlineStorePreviewUrl
        seo { title description }
        featuredImage { url altText }
        images(first: 10) {
          edges { node { id url altText } }
        }
        collections(first: 20) {
          edges { node { id title } }
        }
        options { id name values optionValues { id name } }
        metafields(first: 20) {
          edges {
            node {
              id namespace key type value
              definition { id name }
              references(first: 50) {
                edges {
                  node {
                    ... on Metaobject {
                      id handle type
                      fields { key value }
                    }
                  }
                }
              }
            }
          }
        }
        variants(first: 50) {
          edges {
            node {
              id title price compareAtPrice
              inventoryQuantity barcode sku
              selectedOptions { name value }
              image { id url altText }
              inventoryItem { id requiresShipping tracked }
            }
          }
        }
        media(first: 10) {
          edges {
            node {
              id
              mediaContentType

              ... on MediaImage {
                image {
                  id
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  `, { variables: { id: `gid://shopify/Product/${params.id}` } });

  const data = await res.json();

  // Alle Store-Tags für Autocomplete
  let allTags = [];
  try {
    const tagsRes = await admin.graphql(`query { productTags(first: 250) { edges { node } } }`);
    const tagsJson = await tagsRes.json();
    allTags = tagsJson.data?.productTags?.edges?.map(e => e.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  let allVendors = [];
  let allProductTypes = [];
  try {
    const metaRes = await admin.graphql(`
      query {
        products(first: 100) {
          nodes {
            vendor
            productType
          }
        }
      }
    `);
    const metaJson = await metaRes.json();
    const nodes = metaJson.data?.products?.nodes ?? [];
    allVendors = [...new Set(nodes.map((node) => node.vendor).filter(Boolean))].sort();
    allProductTypes = [...new Set(nodes.map((node) => node.productType).filter(Boolean))].sort();
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  let allCollections = [];
  try {
    const collectionsRes = await admin.graphql(`
      query {
        collections(first: 250) {
          edges {
            node {
              id
              title
              image { url altText }
            }
          }
        }
      }
    `);
    const collectionsJson = await collectionsRes.json();
    allCollections = collectionsJson.data?.collections?.edges?.map((edge) => edge.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  // Lager-Location (erste Location)
  const locRes = await admin.graphql(`query { locations(first: 1) { edges { node { id } } } }`);
  const locJson = await locRes.json();
  const locationId = locJson.data.locations.edges[0]?.node?.id ?? null;

  // Alle im Store existierenden Produkt-Metafield-Definitionen (für Schnell-Anlegen-Buttons)
  let allMetafieldDefinitions = [];
  try {
    const defsRes = await admin.graphql(`
      query {
        metafieldDefinitions(ownerType: PRODUCT, first: 100) {
          edges { node { id name namespace key type { name } } }
        }
      }
    `);
    const defsJson = await defsRes.json();
    allMetafieldDefinitions = defsJson.data?.metafieldDefinitions?.edges?.map(e => e.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  // Aktive Shop-Sprachen (für Metaobject-Übersetzungen bei Eigenschaften)
  let locales = [];
  try {
    const localesRes = await admin.graphql(`query { shopLocales { locale name primary published } }`);
    const localesJson = await localesRes.json();
    locales = (localesJson.data?.shopLocales ?? []).filter(l => l.published);
  } catch (e) { /* falls Scope fehlt: leer */ }

  const [skuFormat, skuAbbreviations, defaultMetafieldOrder] = await Promise.all([
    getSkuFormat(shop),
    getSkuAbbreviations(shop),
    getMetafieldOrder(shop),
  ]);

  return { product: data.data.product, allTags, allVendors, allProductTypes, allCollections, allMetafieldDefinitions, defaultMetafieldOrder, locales, locationId, shop, skuFormat, skuAbbreviations };
};

// ─── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const type = formData.get("action");

  if (type === "saveMetafieldOrder") {
    const scope = formData.get("scope"); // "default" (store-weit) oder "product" (nur dieses Produkt)
    const order = JSON.parse(formData.get("order") || "[]");

    if (scope === "default") {
      await setMetafieldOrder(session.shop, order);
      return { ok: true, type: "saveMetafieldOrder", scope, order };
    }

    // Produkt-Override: als verstecktes Metafield am Produkt speichern
    await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key type value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: "rexpaw",
          key: "metafields_order",
          type: "json",
          value: JSON.stringify(order),
        }],
      },
    });
    return { ok: true, type: "saveMetafieldOrder", scope, order };
  }

  if (type === "duplicate") {
    const res = await admin.graphql(`
  mutation($productId: ID!, $newTitle: String!) {
    productDuplicate(productId: $productId, newTitle: $newTitle, includeImages: true) {
      newProduct { id }
      userErrors { field message }
    }
  }
`, {
      variables: {
        productId: formData.get("id"),
        newTitle: `${formData.get("title")} *** KOPIE ***`,
      }
    });
    const json = await res.json();
    const newId = json.data?.productDuplicate?.newProduct?.id?.split("/").pop();
    return { ok: true, type: "duplicate", newId };
  }

  // SKU oder Barcode einer Variante
  // alle Felder einer Variante auf einmal speichern
  if (type === "updateVariantAll") {
    const variantId = formData.get("variantId");
    const productId = formData.get("productId");
    await admin.graphql(`
      mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }
    `, {
      variables: {
        productId,
        variants: [{
          id: variantId,
          price: formData.get("price"),
          compareAtPrice: formData.get("compareAtPrice") || null,
          barcode: formData.get("barcode") || null,
          inventoryItem: { sku: formData.get("sku") },
        }],
      },
    });
    const inventoryItemId = formData.get("inventoryItemId");
    const locId = formData.get("locationId");
    const quantity = parseInt(formData.get("quantity"), 10);
    if (inventoryItemId && locId && !isNaN(quantity)) {
      await admin.graphql(`
        mutation($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            name: "available", reason: "correction", ignoreCompareQuantity: true,
            quantities: [{ inventoryItemId, locationId: locId, quantity }],
          },
        },
      });
    }
    return { ok: true, type: "updateVariantAll", variantId };
  }

  // Bild zuweisen für Variante
  if (type === "assignVariantImage") {
    const variantId = formData.get("variantId");
    const productId = formData.get("productId");
    const rawMediaId = formData.get("mediaId");
    const mediaId = rawMediaId && rawMediaId !== "null" ? rawMediaId : null;

    // Aktuell zugeordnete Medien der Variante abfragen
    const variantRes = await admin.graphql(`
    query($id: ID!) {
      productVariant(id: $id) {
        media(first: 10) {
          edges { node { id } }
        }
      }
    }
  `, { variables: { id: variantId } });
    const variantJson = await variantRes.json();
    const currentMediaIds = variantJson.data?.productVariant?.media?.edges?.map(e => e.node.id) ?? [];

    // Alte Bilder entfernen
    if (currentMediaIds.length > 0) {
      await admin.graphql(`
      mutation($productId: ID!, $variantMedia: [ProductVariantDetachMediaInput!]!) {
        productVariantDetachMedia(productId: $productId, variantMedia: $variantMedia) {
          userErrors { field message }
        }
      }
    `, {
        variables: {
          productId,
          variantMedia: [{ variantId, mediaIds: currentMediaIds }],
        },
      });
    }

    // Neues Bild zuweisen (falls nicht "kein Bild")
    if (mediaId) {
      await admin.graphql(`
      mutation($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
        productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) {
          userErrors { field message }
        }
      }
    `, {
        variables: {
          productId,
          variantMedia: [{ variantId, mediaIds: [mediaId] }],
        },
      });
    }

    return { ok: true, type: "assignVariantImage" };
  }

  // Status
  if (type === "updateStatus") {
    const res = await admin.graphql(`
      mutation($id: ID!, $status: ProductStatus!) {
        productUpdate(input: { id: $id, status: $status }) {
          product { id status }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), status: formData.get("status") } });
    const data = await res.json();
    return { ok: true, type: "updateStatus", product: data.data.productUpdate.product };
  }

  // Beschreibung
  if (type === "updateDescription") {
    await admin.graphql(`
      mutation($id: ID!, $descriptionHtml: String!) {
        productUpdate(input: { id: $id, descriptionHtml: $descriptionHtml }) {
          product { id }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), descriptionHtml: formData.get("description") } });
    return { ok: true, type: "updateDescription" };
  }

  // Collections und Tags
  if (type === "updateOrganization") {
    const res = await admin.graphql(`
      mutation($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            vendor
            productType
          }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          id: formData.get("id"),
          vendor: formData.get("vendor") || null,
          productType: formData.get("productType") || null,
        },
      },
    });
    const data = await res.json();
    return {
      ok: true,
      type: "updateOrganization",
      product: data?.data?.productUpdate?.product ?? null,
      userErrors: data?.data?.productUpdate?.userErrors ?? [],
    };
  }

  // Optionen und Varianten
  if (type === "updateOptions" || type === "update") {
    const parsedOptions = JSON.parse(formData.get("options") || "[]");
    const validOptions = parsedOptions
      .map((option) => ({
        id: option.id || null,
        name: String(option.name ?? "").trim(),
        values: Array.isArray(option.values)
          ? option.values.map((value) => String(value).trim()).filter(Boolean)
          : [],
      }))
      .filter((option) => option.name && option.values.length > 0);

    await updateProductOptions(admin, formData.get("id"), validOptions);

    // Kürzel-Metafeld speichern (falls mitgeschickt)
    const abbreviationsRaw = formData.get("abbreviations");
    if (abbreviationsRaw) {
      await admin.graphql(`
        mutation($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }
      `, {
        variables: {
          metafields: [{
            ownerId: formData.get("id"),
            namespace: "rexpaw",
            key: "option_abbreviations",
            type: "json",
            value: abbreviationsRaw,
          }],
        },
      });
    }

    const refreshRes = await admin.graphql(`
    query($id: ID!) {
      product(id: $id) {
        id
        options { id name values optionValues { id name } }
        variants(first: 50) {
          edges {
            node {
              id title price compareAtPrice
              inventoryQuantity barcode sku
              selectedOptions { name value }
              image { id url altText }
              inventoryItem { id requiresShipping tracked }
            }
          }
        }
      }
    }
  `, { variables: { id: formData.get("id") } });
    const data = await refreshRes.json();
    return {
      ok: true,
      type: "updateOptions",
      product: data?.data?.product ?? null,
    };
  }

  // SEO
  if (type === "updateSeo") {
    const product = {
      id: formData.get("id"),
      handle: formData.get("handle") || null,
      seo: {
        title: formData.get("seoTitle") || null,
        description: formData.get("seoDescription") || null,
      },
    };

    const res = await admin.graphql(`
      mutation($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          userErrors { field message }
          product {
            id
            handle
            seo { title description }
          }
        }
      }
    `, { variables: { product } });

    const data = await res.json();
    return {
      ok: true,
      type: "updateSeo",
      product: data?.data?.productUpdate?.product ?? null,
      userErrors: data?.data?.productUpdate?.userErrors ?? [],
    };
  }

  // Tags
  if (type === "updateTags") {
    const tags = JSON.parse(formData.get("tags"));
    const res = await admin.graphql(`
      mutation($id: ID!, $tags: [String!]!) {
        productUpdate(input: { id: $id, tags: $tags }) {
          product { id tags }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), tags } });
    const data = await res.json();
    return { ok: true, type: "updateTags", tags: data.data.productUpdate.product.tags };
  }

  // Collections durchsuchen
  if (type === "searchCollections") {
    const res = await admin.graphql(`
      query($query: String!) {
        collections(first: 8, query: $query) {
          edges { node { id title } }
        }
      }
    `, { variables: { query: formData.get("query") } });
    const data = await res.json();
    return {
      ok: true, type: "searchCollections",
      collections: data.data.collections.edges.map(e => e.node),
    };
  }

  // Produkt zur Collection hinzufügen
  if (type === "addToCollection") {
    await admin.graphql(`
      mutation($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("collectionId"), productIds: [formData.get("productId")] } });
    return {
      ok: true, type: "addToCollection",
      collection: { id: formData.get("collectionId"), title: formData.get("collectionTitle") },
    };
  }

  // Produkt aus Collection entfernen
  if (type === "removeFromCollection") {
    await admin.graphql(`
      mutation($id: ID!, $productIds: [ID!]!) {
        collectionRemoveProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("collectionId"), productIds: [formData.get("productId")] } });
    return { ok: true, type: "removeFromCollection", collectionId: formData.get("collectionId") };
  }

  // Metafield hinzufügen
  if (type === "createMetafield") {
    const namespace = formData.get("namespace");
    const key = formData.get("key");
    const metafieldType = formData.get("type");
    const name = formData.get("name") || key;

    // Definition anlegen, damit das Metafield im Storefront/Theme verfügbar ist
    // (ohne Definition mit Storefront-Zugriff bleibt ein per API gesetztes Metafield
    // in der Storefront API unsichtbar). Falls die Definition schon existiert,
    // liefert Shopify einen userError ("TAKEN"), den wir ignorieren.
    await admin.graphql(`
      mutation($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message code }
        }
      }
    `, {
      variables: {
        definition: {
          name,
          namespace,
          key,
          type: metafieldType,
          ownerType: "PRODUCT",
          access: { storefront: "PUBLIC_READ" },
        },
      },
    });

    const res = await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key type value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace,
          key,
          type: metafieldType,
          value: formData.get("value"),
        }],
      },
    });
    const json = await res.json();
    const metafield = json.data?.metafieldsSet?.metafields?.[0] ?? null;
    return { ok: true, type: "createMetafield", metafield };
  }

  // Metaobjects eines Typs durchsuchen (für list.metaobject_reference)
  if (type === "searchMetaobjects") {
    const metaobjectType = formData.get("metaobjectType");
    const res = await admin.graphql(`
      query($type: String!) {
        metaobjects(type: $type, first: 100) {
          edges { node { id handle fields { key value } } }
        }
      }
    `, { variables: { type: metaobjectType } });
    const json = await res.json();
    const metaobjects = json.data?.metaobjects?.edges?.map(e => e.node) ?? [];
    return { ok: true, type: "searchMetaobjects", metaobjects };
  }

  // Felder eines referenzierten Metaobjects bearbeiten (z.B. "eigenschaften"-Eintrag)
  if (type === "updateMetaobject") {
    const metaobjectId = formData.get("metaobjectId");
    const fields = JSON.parse(formData.get("fields") || "[]");
    const res = await admin.graphql(`
      mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject { id fields { key value } }
          userErrors { field message }
        }
      }
    `, { variables: { id: metaobjectId, metaobject: { fields } } });
    const json = await res.json();
    const metaobject = json.data?.metaobjectUpdate?.metaobject ?? null;
    return { ok: true, type: "updateMetaobject", metaobjectId, metaobject };
  }

  // Neues Metaobject anlegen (z.B. neuer "eigenschaften"-Eintrag)
  if (type === "createMetaobject") {
    const metaobjectType = formData.get("metaobjectType");
    const fields = JSON.parse(formData.get("fields") || "[]");
    const res = await admin.graphql(`
      mutation($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id handle type fields { key value } }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metaobject: {
          type: metaobjectType,
          fields,
          capabilities: { publishable: { status: "ACTIVE" } },
        },
      },
    });
    const json = await res.json();
    const metaobject = json.data?.metaobjectCreate?.metaobject ?? null;
    return { ok: true, type: "createMetaobject", metaobject };
  }

  // Übersetzbare Inhalte (Bezeichnung/Wert) + Digest + bestehende Übersetzungen eines Metaobjects laden
  if (type === "getMetaobjectTranslations") {
    const metaobjectId = formData.get("metaobjectId");
    const locales = JSON.parse(formData.get("locales") || "[]");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest locale }
        }
      }
    `, { variables: { id: metaobjectId } });
    const contentJson = await contentRes.json();
    const translatableContent = contentJson.data?.translatableResource?.translatableContent ?? [];

    const translations = {};
    for (const locale of locales) {
      const tRes = await admin.graphql(`
        query($id: ID!, $locale: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $locale) { key value locale }
          }
        }
      `, { variables: { id: metaobjectId, locale } });
      const tJson = await tRes.json();
      translations[locale] = tJson.data?.translatableResource?.translations ?? [];
    }

    return { ok: true, type: "getMetaobjectTranslations", metaobjectId, translatableContent, translations };
  }

  if (type === "saveMetaobjectTranslation") {
    const metaobjectId = formData.get("metaobjectId");
    const locale = formData.get("locale");
    const key = formData.get("key");
    const value = formData.get("value");
    const digest = formData.get("digest");

    const res = await admin.graphql(`
      mutation($id: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $id, translations: $translations) {
          userErrors { field message }
        }
      }
    `, {
      variables: {
        id: metaobjectId,
        translations: [{ locale, key, value, translatableContentDigest: digest }],
      },
    });
    const json = await res.json();
    const userErrors = json.data?.translationsRegister?.userErrors ?? [];
    return { ok: userErrors.length === 0, type: "saveMetaobjectTranslation", metaobjectId, locale, key, value, userErrors };
  }

  if (type === "deleteMetafield") {
    const metafieldId = formData.get("metafieldId");
    await admin.graphql(`
      mutation($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields { key }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
        }],
      },
    });
    return { ok: true, type: "deleteMetafield", metafieldId };
  }

  if (type === "updateMetafield") {
    const metafieldId = formData.get("metafieldId");
    const value = formData.get("value");
    await admin.graphql(`
    mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id value }
        userErrors { field message }
      }
    }
  `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
          type: formData.get("type"),
          value,
        }],
      },
    });

    const name = formData.get("name");
    if (name) {
      await admin.graphql(`
        mutation($definition: MetafieldDefinitionUpdateInput!) {
          metafieldDefinitionUpdate(definition: $definition) {
            updatedDefinition { id name }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          definition: {
            namespace: formData.get("namespace"),
            key: formData.get("key"),
            ownerType: "PRODUCT",
            name,
          },
        },
      });
    }

    return { ok: true, type: "updateMetafield", metafieldId, value, name };
  }

  // Bilder ---------------------------------------------------
  if (type === "uploadImage") {
  const step = formData.get("step");

  if (step === "stage") {
    const stagedTarget = await createStagedUpload(
      admin,
      formData.get("filename"),
      formData.get("mimeType")
    );
    return { ok: true, stagedTarget };
  }

  if (step === "link") {
    const media = await addProductMedia(admin, formData.get("productId"), formData.get("resourceUrl"));
    return { ok: true, mediaId: media?.id ?? null };
  }
}

  if (type === "reorderImages") {
    const mediaIds = JSON.parse(formData.get("mediaIds"));
    await reorderProductMedia(admin, formData.get("productId"), mediaIds);
    return { ok: true, type: "reorderImages" };
  }

  if (type === "deleteImage") {
    await deleteProductMedia(admin, formData.get("productId"), [formData.get("mediaId")]);
    return { ok: true, type: "deleteImage" };
  }

  // Löschen --------------------------------------------------
  if (type === "delete") {
    await admin.graphql(`
      mutation($input: ProductDeleteInput!) {
        productDelete(input: $input) { deletedProductId }
      }
    `, { variables: { input: { id: formData.get("id") } } });
    return { ok: true, type: "delete" };
  }

  return null;
};

// ─── Skeleton ────────────────────────────────────────────────────────────────────

export function HydrateFallback() {
  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <SkeletonDisplayText size="small" />
      </div>
      <Layout>
        <Layout.Section variant="oneThird">
          <SkeletonBodyText lines={3} />
        </Layout.Section>
        <Layout.Section>
          <SkeletonBodyText lines={6} />
        </Layout.Section>
      </Layout>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_TONE = { ACTIVE: "success", DRAFT: "info", ARCHIVED: "warning" };
const STATUS_LABEL = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
const STOCK_TONE = { healthy: "success", low: "warning", out: "critical" };
const STOCK_LABEL = { healthy: "In Ordnung", low: "Niedrig", out: "Ausverkauft" };

function getVariantStockState(quantity) {
  const stock = Number(quantity) || 0;
  if (stock <= 0) return { key: "out", label: STOCK_LABEL.out, tone: STOCK_TONE.out };
  if (stock <= 5) return { key: "low", label: STOCK_LABEL.low, tone: STOCK_TONE.low };
  return { key: "healthy", label: STOCK_LABEL.healthy, tone: STOCK_TONE.healthy };
}

// ─── Komponente ────────────────────────────────────────────────────────────────

export default function ProductDetail() {

  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { product, allTags = [], allVendors = [], allProductTypes = [], allCollections = [], allMetafieldDefinitions = [], defaultMetafieldOrder = [], locales = [], locationId, shop, skuFormat, skuAbbreviations } = useLoaderData();

  // Kürzel-Map aus Metafeld (rexpaw.option_abbreviations)
  const abbreviationsMap = (() => {
    const mf = product.metafields?.edges?.find(
      (e) => e.node.namespace === "rexpaw" && e.node.key === "option_abbreviations"
    );
    try { return mf ? JSON.parse(mf.node.value) : {}; } catch { return {}; }
  })();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.from ?? `/app/products${location.search}`;
  const fetcher = useFetcher();

  // ── Basis-State ──
  //const [selectedImage, setSelectedImage] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const [selectedDetailTab, setSelectedDetailTab] = useState(0);

  const images = product.images?.edges?.map(e => e.node) ?? [];

  const mediaMap = {};
  product.media?.edges?.forEach(e => {
    const mediaId = e.node.id;           // gid://shopify/MediaImage/...
    const imageUrl = e.node.image?.url;  // ← URL statt ID
    if (imageUrl) mediaMap[imageUrl] = mediaId;
  });

  const initialImages = images.map(img => ({
    ...img,
    mediaId: mediaMap[img.url] ?? null,  // ← img.url statt img.id
  }));

  const imageUpload = useImageUpload({
    productId: product.id,
    initialImages,
    setLocalProducts: () => {},
    setToast,
    onImageDelete: (img) => {
      // Varianten die dieses Bild haben → image auf null setzen
      setLocalVariants(prev => prev.map(v =>
        v.image?.url === img.url
          ? { ...v, image: null, mediaId: null }
          : v
      ));
    },
  });

  const metafields = product.metafields?.edges?.map(e => e.node) ?? [];
  // interne/versteckte Felder (z.B. Reihenfolge-Speicher) zählen nicht als sichtbares Metafield
  const visibleMetafieldsCount = metafields.filter(f => f.namespace !== "rexpaw").length;


  // ── Varianten (lokaler State für optimistic UI) ──
  const [localVariants, setLocalVariants] = useState(
    product.variants?.edges?.map(e => e.node) ?? []
  );

  const defaultVariant = localVariants.length === 1 && localVariants[0]?.title === "Default Title" ? localVariants[0] : null;

  const {
    variantDraft, setVariantDraft,
    editingVariantId, setEditingVariantId,
    openVariantEdit, handleVariantSave,
    isSaving,
  } = useVariantEdit({ fetcher, productId: product.id, locationId, setLocalVariants });

  const {
    optionDrafts,
    setOptionDrafts,
    optionsDirty,
    handleOptionsSave,
  } = useProductOptions({ product, fetcher, setLocalVariants, abbreviationsMap, shopAbbreviations: skuAbbreviations ?? {} });

  const hasVariants = localVariants.length > 1 || localVariants[0]?.title !== "Default Title";
  const totalVariants = localVariants.length > 1 ? `${localVariants.length}` : "";
  const totalStock = localVariants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
  const hasZeroStock = localVariants.some(v => (v.inventoryQuantity ?? 0) === 0);

  const variantStockRows = localVariants.map((variant) => {
    const stock = Number(variant.inventoryQuantity) || 0;
    const stockState = getVariantStockState(stock);
    return {
      ...variant,
      stock,
      stockState,
      isSale: variant.compareAtPrice && parseFloat(variant.compareAtPrice) > parseFloat(variant.price),
    };
  });
  const isStatusSaving = fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateStatus";

  const handleStatusToggle = () => {
    const newStatus = product.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    fetcher.submit({ action: "updateStatus", id: product.id, status: newStatus }, { method: "POST" });
  };

  const onVariantImageAssign = (variantId, mediaId, currentMediaId = null) => {

    // Optimistic UI
    setLocalVariants((prev) =>
      prev.map((variant) => {
        if (variant.id !== variantId) return variant;

        const selectedImage =
          imageUpload.localImages.find(
            (img) => img.mediaId === mediaId
          ) ?? null;

        if (!mediaId) {
          return {
            ...variant,
            mediaId: null,
            image: null,
          };
        }

        return {
          ...variant,
          mediaId,
          image: selectedImage
            ? {
                id: selectedImage.id,
                url: selectedImage.url,
                altText: selectedImage.altText,
              }
            : null,
        };
      })
    );

    fetcher.submit(
      {
        action: "assignVariantImage",
        variantId,
        mediaId,
        currentMediaId,
        productId: product.id,
      },
      { method: "POST" }
    );
  };

  const detailTabs = [
    { id: "variants", content: `Varianten${variantStockRows.length ? ` (${variantStockRows.length})` : ""}` },
    //{ id: "shipping", content: "Shipping" },
    { id: "metafields", content: `Metafields${visibleMetafieldsCount ? ` (${visibleMetafieldsCount})` : ""}` },
  ];


  // ── Effekte: fetcher responses ──

  useEffect(() => {

    if (!fetcher.data) return;

    if (fetcher.data.type === "delete") {
      setToast(`${product.title} *** KOPIE *** erstellt 🎉`);
      navigate(returnTo);
      return;
    }

    if (fetcher.data.type === "duplicate") {
      setToast("Produkt dupliziert ✅");
      if (fetcher.data.newId) {
        navigate(`/app/products/${fetcher.data.newId}${location.search}`);
      }
      return;
    }

    if (!fetcher.data?.product) return;
    const next = fetcher.data.product;

    if (
      fetcher.data.type === "updateOptions" ||
      fetcher.data.type === "update"
    ) {

    const nextVariants =
      next.variants?.edges?.map((e) => {
        const node = e.node;

        const matchedImage = imageUpload.localImages.find(
          (img) => img.url === node.image?.url
        );

        return {
          ...node,
          mediaId: matchedImage?.mediaId ?? null,
        };
      }) ?? [];

      setLocalVariants(nextVariants);

      if (
        fetcher.data.type === "updateOptions" ||
        fetcher.data.type === "update"
      ) {
        setOptionDrafts(normalizeOptions(next.options ?? []));
        setToast?.("Optionen gespeichert");
      }
    }
  }, [fetcher.data, setOptionDrafts]);

  // Bilder aus Loader initialisieren
  useEffect(() => {
    const imgs = (product.images?.edges?.map(e => e.node) ?? []).map((img) => ({
      ...img,
      mediaId: mediaMap[img.url] ?? null,
    }));

    imageUpload.setLocalImages(imgs);
  }, []);

  // Toast wieder ausblenden
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Handler ──
  const handleDelete = () => {
    fetcher.submit({ action: "delete", id: product.id }, { method: "POST" });
    setDeleteModalOpen(false);
    navigate(returnTo);
  };

  // ── Seite ──

  return (
    <AppLayout>
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => navigate(returnTo)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <Icon source={ArrowLeftIcon} />
          </button>
          <Text variant="headingLg" as="h1">{product.title}</Text>
          <Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            disabled={product.status !== "ACTIVE"}
            onClick={() => {
              const a = document.createElement("a");
              a.href = product.onlineStorePreviewUrl;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.click();
            }}
          >
            Im Shop ansehen
          </Button>
          <Button
            onClick={() => {
              fetcher.submit(
                { action: "duplicate", id: product.id, title: product.title },
                { method: "post" }
              );
              setToast(`${product.title} wird kopiert…`);
            }}
          >
            Duplizieren
          </Button>
          <Button tone="critical" onClick={() => setDeleteModalOpen(true)}>Löschen</Button>
          <Button variant="primary" loading={isStatusSaving} onClick={handleStatusToggle}>
            {product.status === "ACTIVE" ? "Auf Entwurf setzen" : "Aktivieren"}
          </Button>
        </div>
      </div>
      <Layout>

        {/* ── Linke Spalte ── */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">

            {/* Bilder */}
            <Card>
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
            </Card>

            {/* Produktinfos */}
            <ProductDetailInfos
              product={product}
              fetcher={fetcher}
              formatDate={formatDate}
              totalStock={totalStock}
              hasZeroStock={hasZeroStock}
              allVendors={allVendors}
              allProductTypes={allProductTypes}
            />

          </BlockStack>
        </Layout.Section>

        {/* ── Rechte Spalte ── */}
        <Layout.Section>
          <BlockStack gap="400">

            {/* ── Beschreibung (editierbar) ── */}
            <ProductDetailDescription
              product={product}
              fetcher={fetcher}
              productId={product.id}
              setToast={setToast}
            />

            {/* ── SEO ── */}
            <ProductDetailSeo
              product={product}
              fetcher={fetcher}
              shop={shop}
              setToast={setToast}

            />

            {/* ── Organization Collections / Tags ── */}
            <ProductDetailOrganisation
              product={product}
              allCollections={allCollections}
              allTags={allTags}
              fetcher={fetcher}
              setToast={setToast}
            />

            {/* ── TABS ── */}
            <ProductDetailTabs
              selectedDetailTab={selectedDetailTab}
              setSelectedDetailTab={setSelectedDetailTab}
              detailTabs={detailTabs}
              localImages={imageUpload.localImages}
              onVariantImageAssign={onVariantImageAssign}
              setLocalImages={imageUpload.setLocalImages}
              optionDrafts={optionDrafts}
              setOptionDrafts={setOptionDrafts}
              optionsDirty={optionsDirty}
              handleOptionsSave={handleOptionsSave}
              hasVariants={hasVariants}
              totalVariants={totalVariants}
              localVariants={localVariants}
              defaultVariant={defaultVariant}
              variantDraft={variantDraft}
              setVariantDraft={setVariantDraft}
              editingVariantId={editingVariantId}
              setEditingVariantId={setEditingVariantId}
              openVariantEdit={openVariantEdit}
              handleVariantSave={handleVariantSave}
              isSaving={isSaving}
              metafields={metafields}
              allMetafieldDefinitions={allMetafieldDefinitions}
              defaultMetafieldOrder={defaultMetafieldOrder}
              locales={locales}
              product={product}
              fetcher={fetcher}
              setToast={setToast}
              skuFormat={skuFormat}
            />

          </BlockStack>
        </Layout.Section>

        {/* ── Delete Modal ── */}
        <Modal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Produkt löschen"
          primaryAction={{ content: "Löschen", destructive: true, onAction: handleDelete }}
          secondaryActions={[{ content: "Abbrechen", onAction: () => setDeleteModalOpen(false) }]}
        >
          <Modal.Section>
            <Text>Wirklich löschen: <strong>{product.title}</strong>? Diese Aktion kann nicht rückgängig gemacht werden.</Text>
          </Modal.Section>
        </Modal>

        {toast && (
          <div style={{
            position: "fixed", bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#303030", color: "white",
            padding: "12px 16px", borderRadius: 8,
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}>
            {toast}
          </div>
        )}

      </Layout>

    </div>
    </AppLayout>
  );
}
