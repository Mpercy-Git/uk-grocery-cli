---
name: grocery-api
description: "Fast Sainsbury's grocery access over the local groc HTTP API. Use when the user asks to search Sainsbury's products or favourites, or to view, add to, update, or remove items from their basket, and the local API server is running."
license: MIT
compatibility: "Node.js 18+, TypeScript. Needs the local groc API running on port 7876."
allowed-tools: Bash(node:*), Bash(npm:*)
metadata:
  author: zish
  version: "2.1.0"
  repository: https://github.com/abracadabra50/uk-grocery-cli
  tags: "groceries, sainsburys, uk, shopping, automation, http-api, agent-tool"
---

# Grocery API

Search Sainsbury's products and favourites and manage the basket through the local
`groc` HTTP API. This is the low-latency path: the API server holds the session, so
each call skips CLI startup.

The API must already be running on port `7876`:

```bash
GROC_API_PORT=7876 npm run api
```

Run every command below from the repository root — the directory containing `package.json`.

## Commands

```bash
node skills/grocery-api/wrapper.js fav-search "milk"
node skills/grocery-api/wrapper.js search "milk"
node skills/grocery-api/wrapper.js favourites
node skills/grocery-api/wrapper.js basket
node skills/grocery-api/wrapper.js add <product-id> [qty]
node skills/grocery-api/wrapper.js remove <item-id>
node skills/grocery-api/wrapper.js update <item-id> <qty>
```

Every command returns JSON from the local API.

Use `product_uid` as the product ID for `add`, and the basket `item_id` for
`remove` and `update`.

## Adding to the basket

Favourites are what the user actually buys, so search those first.

1. Search favourites:

   ```bash
   node skills/grocery-api/wrapper.js fav-search "USER ITEM"
   ```

2. If exactly one favourite clearly matches, add it:

   ```bash
   node skills/grocery-api/wrapper.js add <product-id> [qty]
   ```

3. If several favourites plausibly match, ask the user which one — list names, prices, and product IDs.

4. If nothing in favourites matches, or the user explicitly asks to look wider, use the full catalogue:

   ```bash
   node skills/grocery-api/wrapper.js search "USER ITEM"
   ```

5. Always confirm with the user before adding anything that came from a regular search.

6. After adding, show or summarise the basket:

   ```bash
   node skills/grocery-api/wrapper.js basket
   ```

## Removing or updating items

1. Read the basket first to get the item IDs:

   ```bash
   node skills/grocery-api/wrapper.js basket
   ```

2. Act on the basket `item_id`, never the product ID:

   ```bash
   node skills/grocery-api/wrapper.js remove <item-id>
   node skills/grocery-api/wrapper.js update <item-id> <qty>
   ```

3. If it is ambiguous which basket item the user means, ask.

4. After removing or updating, show or summarise the basket.

## Scope

This skill covers search and basket only. Delivery slots and checkout are not
exposed here — use the `sainsburys-groceries` skill for those, which gates order
placement behind explicit user approval.
