# ProductFlow 🚀

A Shopify embedded app for managing products efficiently — built with Remix/React Router 7, Polaris and the Shopify Admin GraphQL API.

![ProductFlow Screenshot](./docs/screenshot.png)

---

## Features

- 📋 **Product List** — displays all products with status badge (Active, Draft, Archived)
- ✏️ **Edit** — rename products inline via modal
- 🗑️ **Delete** — single and bulk delete with 5-second undo
- ➕ **Create** — generate products with random names
- 🔍 **Search** — filter products by title in real time
- 📄 **Pagination** — client-side pagination (50 per page) or infinite scroll for smaller catalogs
- 🎯 **Bulk Select** — select all visible products and delete at once
- ✨ **Optimistic UI** — list updates instantly without page reload
- 🎬 **Animations** — smooth drag & drop reordering via Framer Motion

---

## Tech Stack

| Technology | Purpose |
|---|---|
| [Remix / React Router 7](https://reactrouter.com) | Full-stack framework |
| [Shopify App React Router](https://shopify.dev/docs/apps) | Shopify embedded app adapter |
| [Polaris](https://polaris.shopify.com) | Shopify design system |
| [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql) | Product CRUD operations |
| [Prisma](https://www.prisma.io) | Session storage |
| [Framer Motion](https://www.framer.com/motion) | Animations & drag/drop |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) >= 18
- [Shopify Partner Account](https://partners.shopify.com)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/productflow.git
cd productflow

# Install dependencies
npm install

# Set up the database
npx prisma migrate dev

# Start the development server
shopify app dev
```

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=your_app_url
SCOPES=write_products,read_products
```

---

## Architecture Decisions

**Client-side pagination instead of server-side cursor pagination**

Shopify embedded apps use JWT tokens that expire on every new server request when triggered from the client. To avoid constant re-authentication loops, all products are loaded once on the server at startup and pagination is handled in the browser.

**Optimistic UI for all mutations**

Create, update, delete and bulk delete operations update the local React state immediately without waiting for the server response. This makes the UI feel instant.

**Bulk delete with undo**

Instead of deleting immediately, a 5-second countdown gives the user the chance to cancel. The GraphQL mutation only fires after the timer completes.

---

## Roadmap

- [ ] Change product status (Active/Draft) directly in the list
- [ ] Display product images
- [ ] Edit price and inventory
- [ ] Filter by status
- [ ] Metafields editor

---

## License

MIT
