import { publishToOnlineStore } from "../../services/publish.server";

// ── Duplikat-Check ────────────────────────────────────────────────────────────

const CHECK_BY_SKU = `
  query($sku: String!) {
    productVariants(first: 1, query: $sku) {
      edges { node { sku product { id title } } }
    }
  }
`;

const CHECK_BY_TITLE = `
  query($title: String!) {
    products(first: 1, query: $title) {
      edges { node { id title } }
    }
  }
`;

export async function handleCheckSku(admin, formData) {
  const sku       = formData.get("sku");
  const excludeId = formData.get("excludeId"); // eigenes Produkt ausschließen
  if (!sku?.trim()) return Response.json({ exists: false });

  const res  = await admin.graphql(CHECK_BY_SKU, { variables: { sku: `sku:${sku.trim()}` } });
  const json = await res.json();
  const found = json?.data?.productVariants?.edges?.[0]?.node;

  if (!found) return Response.json({ exists: false });
  // Nicht als Duplikat werten wenn es vom gleichen Produkt stammt
  if (excludeId && found.product.id === excludeId) return Response.json({ exists: false });

  return Response.json({ exists: true, productTitle: found.product.title, productId: found.product.id });
}

export async function handleCheckImport(admin, formData) {
  const rows = JSON.parse(formData.get("rows"));

  const results = await Promise.all(
    rows.map(async (row) => {
      // 1. Hat die Zeile eine numerische oder vollständige Shopify-ID? → Update
      if (row.id) {
        const existingId = row.id.includes("gid://")
          ? row.id
          : `gid://shopify/Product/${row.id}`;
        return { ...row, status: "update", existingId, existingTitle: row.title };
      }

      // 2. SKU vorhanden → per SKU suchen → direktes Update (alle SKUs der Varianten prüfen)
      const skus = (row.variants ?? []).map(v => v.sku).filter(Boolean);
      for (const sku of skus) {
        const res = await admin.graphql(CHECK_BY_SKU, {
          variables: { sku: `sku:${sku.trim()}` },
        });
        const json = await res.json();
        const found = json?.data?.productVariants?.edges?.[0]?.node;
        if (found) {
          return {
            ...row,
            status: "update",
            existingId: found.product.id,
            existingTitle: found.product.title,
            matchedBy: "SKU",
          };
        }
      }

      // 3. Titel-Suche als Fallback → "duplicate" (User entscheidet)
      if (row.title?.trim()) {
        const res = await admin.graphql(CHECK_BY_TITLE, {
          variables: { title: `title:"${row.title.trim()}"` },
        });
        const json = await res.json();
        const found = json?.data?.products?.edges?.[0]?.node;
        if (found && found.title.toLowerCase() === row.title.trim().toLowerCase()) {
          return {
            ...row,
            status: "duplicate",
            existingId: found.id,
            existingTitle: found.title,
            matchedBy: "Titel",
          };
        }
      }

      return { ...row, status: "new" };
    })
  );

  return Response.json({ results });
}

// ── Import ausführen ──────────────────────────────────────────────────────────

const GET_EXISTING_TAGS = `
  query($id: ID!) {
    product(id: $id) { tags }
  }
`;

// ── Collection-Hilfsfunktionen ────────────────────────────────────────────────

const FIND_COLLECTION = `
  query($title: String!) {
    collections(first: 1, query: $title) {
      edges { node { id title } }
    }
  }
`;

const CREATE_COLLECTION = `
  mutation($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id title }
      userErrors { field message }
    }
  }
`;

const ADD_TO_COLLECTION = `
  mutation($id: ID!, $products: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $products) {
      userErrors { field message }
    }
  }
`;

// Gibt Collection-ID zurück — legt sie an falls nicht vorhanden
async function resolveCollection(admin, title, collectionCache) {
  if (collectionCache.has(title)) return collectionCache.get(title);

  const res  = await admin.graphql(FIND_COLLECTION, { variables: { title: `title:"${title}"` } });
  const json = await res.json();
  const found = json?.data?.collections?.edges?.[0]?.node;

  if (found && found.title.toLowerCase() === title.toLowerCase()) {
    collectionCache.set(title, found.id);
    return found.id;
  }

  // Neu anlegen
  const createRes  = await admin.graphql(CREATE_COLLECTION, { variables: { input: { title } } });
  const createJson = await createRes.json();
  const newId = createJson?.data?.collectionCreate?.collection?.id;
  if (newId) collectionCache.set(title, newId);
  return newId ?? null;
}

// ── Produkt-Mutations ─────────────────────────────────────────────────────────

const PRODUCT_CREATE = `
  mutation($input: ProductInput!) {
    productCreate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE = `
  mutation($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
`;

function parsePrice(raw) {
  if (!raw) return undefined;
  return String(raw).replace(/[€$\s]/g, "").replace(",", ".") || undefined;
}

function parseStatus(raw) {
  const s = String(raw ?? "").toUpperCase();
  if (["ACTIVE", "DRAFT", "ARCHIVED"].includes(s)) return s;
  const map = { AKTIV: "ACTIVE", ENTWURF: "DRAFT", ARCHIVIERT: "ARCHIVED" };
  return map[s] ?? "DRAFT";
}

export async function handleExecuteImport(admin, formData) {
  const products = JSON.parse(formData.get("products")); // grouped by product
  const skipDuplicates = formData.get("skipDuplicates") === "true";

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const collectionCache = new Map(); // verhindert doppelte API-Calls für gleiche Kollektion

  for (const product of products) {
    if (product.status === "duplicate" && skipDuplicates) {
      skipped++;
      continue;
    }

    const isUpdate = product.status === "update";

    const variants = (product.variants ?? []).map((v) => {
      const variant = {};
      // Option-Werte → Shopify erkennt daraus automatisch die Optionen
      if (v.selectedOptions?.length > 0) {
        variant.optionValues = v.selectedOptions.map(o => ({ optionName: o.name, name: o.value }));
      }
      if (v.price)            variant.price = parsePrice(v.price);
      if (v.compareAtPrice)   variant.compareAtPrice = parsePrice(v.compareAtPrice);
      if (v.sku)              variant.sku = v.sku;
      return variant;
    }).filter(v => Object.keys(v).length > 0);

    // Options-Definitionen aus den Varianten ableiten
    const optionNames = [];
    (product.variants ?? []).forEach(v => {
      (v.selectedOptions ?? []).forEach(o => {
        if (!optionNames.includes(o.name)) optionNames.push(o.name);
      });
    });

    const input = {
      title: product.title,
      status: parseStatus(product.rawStatus),
      tags: await (async () => {
        const csvTags = product.tags ? product.tags.split(/[|,]/).map(t => t.trim()).filter(Boolean) : [];
        if (!isUpdate || csvTags.length === 0) return csvTags;
        // Bei Update: bestehende Tags holen und mergen
        const res  = await admin.graphql(GET_EXISTING_TAGS, { variables: { id: product.existingId } });
        const json = await res.json();
        const existing = json?.data?.product?.tags ?? [];
        return [...new Set([...existing, ...csvTags])];
      })(),
      ...(optionNames.length > 0 ? { productOptions: optionNames.map(name => ({ name })) } : {}),
      ...(variants.length > 0 ? { variants } : {}),
    };

    if (isUpdate) input.id = product.existingId;

    try {
      const mutation = isUpdate ? PRODUCT_UPDATE : PRODUCT_CREATE;
      const res = await admin.graphql(mutation, { variables: { input } });
      const json = await res.json();
      const result = json?.data?.productCreate ?? json?.data?.productUpdate;
      const userErrors = result?.userErrors ?? [];

      if (userErrors.length > 0) {
        errors.push({ title: product.title, errors: userErrors.map(e => e.message) });
      } else {
        isUpdate ? updated++ : created++;

        // Collections zuweisen (suchen oder neu anlegen)
        const productId = result?.product?.id;

        if (!isUpdate && productId && input.status === "ACTIVE") {
          await publishToOnlineStore(admin, productId);
        }
        const collectionNames = (product.collections ?? "")
          .split(/[|,]/).map(c => c.trim()).filter(Boolean);

        if (productId && collectionNames.length > 0) {
          for (const name of collectionNames) {
            try {
              const collectionId = await resolveCollection(admin, name, collectionCache);
              if (collectionId) {
                await admin.graphql(ADD_TO_COLLECTION, {
                  variables: { id: collectionId, products: [productId] },
                });
              }
            } catch (e) {
              // Collection-Fehler nicht als Import-Fehler werten, nur loggen
              console.warn(`Collection "${name}" konnte nicht zugewiesen werden:`, e.message);
            }
          }
        }
      }
    } catch (err) {
      errors.push({ title: product.title, errors: [err.message] });
    }
  }

  return Response.json({ created, updated, skipped, errors });
}
