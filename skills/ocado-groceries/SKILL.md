---
name: ocado-groceries
description: "Ocado UK grocery automation. Use when the user wants to shop at Ocado, check Ocado prices or stock, manage their Ocado trolley, browse categories or favourites, or check Ocado delivery slots."
license: MIT
compatibility: "Node.js 18+, TypeScript. London & South England delivery areas only."
allowed-tools: Bash(npm:*)
metadata:
  author: zish
  version: "2.1.0"
  repository: https://github.com/abracadabra50/uk-grocery-cli
  tags: "groceries, ocado, uk, shopping, automation, mcp, agent-tool"
---

# Ocado Groceries

Search products, manage the trolley, browse categories, and check delivery slots at Ocado.

Run every command below from the repository root — the directory containing `package.json`.

Keep the `--` after `npm run groc`: without it npm swallows any `--flag`, so
`npm run groc search "milk" --json` silently runs without `--json`. If you have
linked the CLI globally, `groc ...` takes the flags directly.

## Status

Rebuilt in 2026-07 against Ocado's current internal web-app JSON API.

**Working:** login and session import, search, product lookup, category browse,
favourites, full trolley CRUD, delivery slot listing, order history, regulars.

**Not implemented:** slot *booking* and checkout. AWS WAF bot detection blocks
both, and they throw clear errors rather than failing silently. The user finishes
those on ocado.com — the trolley built here is the same server-side trolley they
will see.

Implementation notes:

- Trolley reads and writes go through `GET/POST /api/cart/v1/carts/active(/apply-quantity)`, with writes signed by an `x-csrf-token` header scraped from page HTML.
- Product info comes from `PUT /api/webproductpagews/v6/products`.
- Search parses the `productEntities` blob embedded in the server-rendered `/search?q=` page.
- Products are addressed by **UUID**, not the numeric SKU in the URL.

## When to use

- The user wants to buy groceries from Ocado
- The user asks about product prices or availability at Ocado
- The user wants to manage their Ocado basket/trolley
- The user wants to see Ocado delivery slots
- The user is in London or South England (Ocado's delivery area)

## Setup

```bash
npm install
```

## Authentication

```bash
# Option 1 — Playwright login
npm run groc -- --provider ocado login --email EMAIL --password PASS

# Option 2 — import cookies from a real browser (recommended, beats the WAF)
# Log in at ocado.com, export cookies with the "Cookie Editor" extension, then:
npm run groc -- --provider ocado import-session --file ~/Downloads/ocado-cookies.json
```

The session is saved to `~/.ocado/session.json`.

- Ocado sits behind AWS WAF bot detection: cold HTTP requests get an empty 202 challenge. Real browser cookies carry the WAF token and make plain HTTP work, so `import-session` is the reliable path.
- If commands fail with "AWS WAF challenge or expired session", re-import the cookies.

## CLI commands

All commands need `--provider ocado`.

### Search

```bash
npm run groc -- --provider ocado search "milk"
npm run groc -- --provider ocado search "organic bread" --limit 10 --json
```

### Trolley

```bash
npm run groc -- --provider ocado basket                    # View trolley
npm run groc -- --provider ocado basket --json             # JSON output
npm run groc -- --provider ocado add <product-id> --qty 2  # Add item
npm run groc -- --provider ocado update <item-id> 3        # Update quantity
npm run groc -- --provider ocado remove <item-id>          # Remove item
npm run groc -- --provider ocado clear --force             # Clear trolley
```

Use the product **UUID** for `add`, and the trolley `item_id` for `update` and `remove`.

### Browsing and favourites

```bash
npm run groc -- --provider ocado favourites --json         # Favourite / frequently-bought
npm run groc -- --provider ocado fav-search "milk" --json  # Search within favourites
npm run groc -- --provider ocado categories --json         # List browse categories
npm run groc -- --provider ocado browse "/categories/<slug>/<id>" --json
npm run groc -- --provider ocado regulars --json           # Recurring-shopping definitions
```

### Delivery and orders

```bash
npm run groc -- --provider ocado slots      # View delivery slots (works)
npm run groc -- --provider ocado orders     # Order history with line items (works)
npm run groc -- --provider ocado book <id>  # Not implemented (AWS WAF) — errors
npm run groc -- --provider ocado checkout   # Not implemented (AWS WAF) — errors
```

## Placing an order

Ocado orders cannot be placed from here. Build the trolley, show the user the
slots, and hand off: they book the slot and check out on ocado.com against the
same trolley. Do not present the order as placed.

Running inside Frona, the hand-off is the whole story for Ocado — there is no
order to approve. See [`docs/FRONA.md`](../../docs/FRONA.md).

## MCP tools

With the MCP server, pass `provider: "ocado"`:

| Tool | Description |
|------|-------------|
| `grocery_search` | Search Ocado products |
| `grocery_basket_view` | View trolley contents |
| `grocery_basket_add` | Add product to trolley |
| `grocery_basket_remove` | Remove product from trolley |
| `grocery_basket_update` | Update item quantity |
| `grocery_basket_clear` | Clear all items |
| `grocery_favourites` | Favourite / frequently-bought products |
| `grocery_favourites_search` | Search within favourites |
| `grocery_categories` | List browse categories |
| `grocery_browse` | Browse products in a category |
| `ocado_regulars` | Recurring-shopping definitions |
| `grocery_slots` | List delivery slots |
| `grocery_book_slot` | Errors — not implemented (AWS WAF) |
| `grocery_checkout` | Errors — not implemented (AWS WAF) |
| `grocery_orders` | View order history |
| `grocery_login` | Login to Ocado |

## API details

```text
Base: https://www.ocado.com

GET  /search?q=milk                            # Search (server-rendered productEntities blob)
GET  /api/cart/v1/carts/active                 # Read trolley
POST /api/cart/v1/carts/active/apply-quantity  # Write trolley (quantities are DELTAS)
PUT  /api/webproductpagews/v6/products         # Batch product info by UUID
POST /api/ecomslots/v2/slots                   # Delivery slots
POST /graphql                                  # Order history (GetCompletedOrders)
```

Writes need an `x-csrf-token` header scraped from any page's HTML. This is handled
automatically, with one re-scrape on a 403.

## Example workflow

```bash
# 1. Search for products
npm run groc -- --provider ocado search "free range eggs" --json

# 2. Add to the trolley
npm run groc -- --provider ocado add PRODUCT_UUID --qty 1

# 3. Check the trolley
npm run groc -- --provider ocado basket --json

# 4. Show slots, then hand off to the user to book and check out on ocado.com
npm run groc -- --provider ocado slots --json
```

## Limitations

- **London & South England only** (Ocado's delivery area)
- **Slot booking and checkout are not implemented** — AWS WAF blocks them; hand off to the user at ocado.com
- Cold requests without cookies get an empty HTTP 202 (WAF challenge) — use `import-session`
- Playwright login can be blocked; browser cookie import is the reliable path
