import { publishToOnlineStore } from "../services/publish.server";

export async function collectionsAction({ request }, admin) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const title = formData.get("title");
    const res = await admin.graphql(
      `#graphql
      mutation CreateCollection($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id title }
          userErrors { field message }
        }
      }`,
      { variables: { input: { title } } }
    );
    const data = await res.json();
    const errors = data.data.collectionCreate.userErrors;
    if (errors.length) return { error: errors[0].message };
    const collectionId = data.data.collectionCreate.collection?.id;
    let publishResult = null;
    if (collectionId) publishResult = await publishToOnlineStore(admin, collectionId);
    return { success: true, action: "created", title, publishResult };
  }

  if (intent === "rename") {
    const id = formData.get("id");
    const title = formData.get("title");
    const res = await admin.graphql(
      `#graphql
      mutation UpdateCollection($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id title }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id, title } } }
    );
    const data = await res.json();
    const errors = data.data.collectionUpdate.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { success: true, action: "renamed", title };
  }

  if (intent === "getTitleTranslation") {
    const id = formData.get("id");
    const locales = JSON.parse(formData.get("locales") || "[]");

    const contentRes = await admin.graphql(`
      query($id: ID!) {
        translatableResource(resourceId: $id) {
          translatableContent { key value digest locale }
        }
      }
    `, { variables: { id } });
    const contentJson = await contentRes.json();
    const titleContent = (contentJson.data?.translatableResource?.translatableContent ?? []).find((c) => c.key === "title");

    const translations = {};
    for (const locale of locales) {
      const tRes = await admin.graphql(`
        query($id: ID!, $locale: String!) {
          translatableResource(resourceId: $id) {
            translations(locale: $locale) { key value locale }
          }
        }
      `, { variables: { id, locale } });
      const tJson = await tRes.json();
      const titleTranslation = (tJson.data?.translatableResource?.translations ?? []).find((t) => t.key === "title");
      translations[locale] = titleTranslation?.value ?? "";
    }

    return { success: true, intent: "getTitleTranslation", id, digest: titleContent?.digest, translations };
  }

  if (intent === "saveTitleTranslation") {
    const id = formData.get("id");
    const locale = formData.get("locale");
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
        id,
        translations: [{ locale, key: "title", value, translatableContentDigest: digest }],
      },
    });
    const data = await res.json();
    const errors = data.data?.translationsRegister?.userErrors ?? [];
    if (errors.length) return { error: errors[0].message };
    return { success: true, intent: "saveTitleTranslation", locale, value };
  }

  if (intent === "delete") {
    const id = formData.get("id");
    const res = await admin.graphql(
      `#graphql
      mutation DeleteCollection($input: CollectionDeleteInput!) {
        collectionDelete(input: $input) {
          deletedCollectionId
          userErrors { field message }
        }
      }`,
      { variables: { input: { id } } }
    );
    const data = await res.json();
    const errors = data.data.collectionDelete.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { success: true, action: "deleted" };
  }

  return { error: "Unbekannte Aktion" };
}
