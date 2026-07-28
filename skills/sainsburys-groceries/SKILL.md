---
name: sainsburys-groceries
description: "Sainsbury's UK grocery automation. Use when the user wants to shop at Sainsbury's, check Sainsbury's prices or stock, manage their Sainsbury's basket, book a delivery slot, or place an order."
license: MIT
allowed-tools: Bash(npm run groc:*), Bash(npm install:*), Bash(npx playwright install:*)
metadata:
  author: zish
  version: "2.1.0"
  repository: https://github.com/abracadabra50/uk-grocery-cli
  requires: "Node.js 18+, Playwright for login. UK Sainsbury's delivery areas only."
  tags: [groceries, sainsburys, uk, shopping, automation, mcp, agent-tool]
---

# Sainsbury's Groceries

Search products, manage the basket, book delivery slots, and place orders at Sainsbury's.

Run every command below from the repository root — the directory containing `package.json`.

Keep the `--` after `npm run groc`: without it npm swallows any `--flag`, so
`npm run groc search "milk" --json` silently runs without `--json`. If you have
linked the CLI globally, `groc ...` takes the flags directly.

## When to use

- The user wants to buy groceries from Sainsbury's
- The user asks about product prices or availability at Sainsbury's
- The user wants to manage their Sainsbury's basket
- The user needs to book a Sainsbury's delivery slot
- The user wants to place a Sainsbury's order

## Setup

```bash
npm install
npx playwright install chromium
```

## Authentication

```bash
# Opens a browser; SMS 2FA may be required on a fresh login
npm run groc -- --provider sainsburys login --email EMAIL --password PASS
```

The session is saved to `~/.sainsburys/session.json`.

- SMS 2FA may be required on fresh logins.
- Sessions expire after roughly 20 minutes of real-world use.
- **Auto re-auth (recommended for agents):** set `SAINSBURYS_EMAIL` and `SAINSBURYS_PASSWORD`, and the CLI re-logins headlessly on any 401/403 and retries the failed request. MFA-protected accounts fail fast with a pointer to interactive login instead of hanging.

## CLI commands

Sainsbury's is the default provider, so `--provider sainsburys` can be omitted.

### Search

```bash
npm run groc -- search "organic milk"
npm run groc -- search "chicken breast" --limit 10 --json
```

### Basket

```bash
npm run groc -- basket                      # View basket
npm run groc -- basket --json               # JSON output
npm run groc -- add <product-id> --qty 2    # Add item
npm run groc -- update <item-id> 3          # Update quantity
npm run groc -- remove <item-id>            # Remove item
npm run groc -- clear --force               # Clear basket
```

Use `product_uid` for `add`, and the basket `item_id` for `update` and `remove`.

### Delivery and orders

```bash
npm run groc -- slots                       # View delivery slots
npm run groc -- slots --json                # JSON output
npm run groc -- book <slot-id>              # Book slot
npm run groc -- checkout --dry-run          # Preview the order
npm run groc -- checkout --yes              # Place the order (needs user approval first)
npm run groc -- orders                      # Order history
```

## Placing an order

Search, basket edits, and slot booking can all be done autonomously. Placing the
order cannot — it spends the user's money and needs their explicit approval.

1. Preview: `npm run groc -- checkout --dry-run`.
2. Show the user the items, the total, and the delivery slot.
3. Only after they approve, place it: `npm run groc -- checkout --yes`.

Plain `npm run groc -- checkout` refuses to run and prints these steps. Over MCP the
same gate is enforced by `grocery_checkout` (see below).

## MCP tools

With the MCP server, pass `provider: "sainsburys"`:

| Tool | Description |
|------|-------------|
| `grocery_search` | Search Sainsbury's products |
| `grocery_favourites` | Favourite / frequently-bought products |
| `grocery_favourites_search` | Search within favourites |
| `grocery_categories` | List browse categories |
| `grocery_basket_view` | View basket contents |
| `grocery_basket_add` | Add product to basket |
| `grocery_basket_remove` | Remove product from basket |
| `grocery_basket_update` | Update item quantity |
| `grocery_basket_clear` | Clear all items |
| `grocery_slots` | List delivery slots |
| `grocery_book_slot` | Book a delivery slot |
| `grocery_checkout` | Preview, then place the order — requires user approval |
| `grocery_orders` | View order history |
| `grocery_login` | Login to Sainsbury's |

`grocery_checkout` runs in two steps. Call it with `dry_run: true` (the default)
to get a preview and a single-use `confirmation_code`, show that preview to the
user, and only once they approve call it again with `dry_run: false` and that
code. The code expires after 10 minutes and is void if the basket changes.

## API endpoints

```text
Base: https://www.sainsburys.co.uk/groceries-api/gol-services

GET  /product/v1/product?filter[keyword]=milk      # Search
GET  /basket/v2/basket                             # View basket
POST /basket/v2/basket/items                       # Add to basket
PUT  /basket/v2/basket                             # Update basket
GET  /slot/v1/slot/reservation                     # Delivery slots
POST /checkout/v1/checkout                         # Checkout
GET  /order/v1/order?page_size=10&page_number=1    # Order history list
GET  /order/v1/order/{order_uid}                   # Single order detail (incl. items)
```

**Order history note:** the correct page URL is `/gol-ui/my-account/orders`, not
`/shop/gb/groceries/order-history` (a legacy 404). The API returns `order_uid`
(not `order_id`) and `order_items` (not `items`) in the detail response.

## Example workflow

```bash
# 1. Search for ingredients
npm run groc -- search "organic eggs" --json

# 2. Add to basket
npm run groc -- add 357937 --qty 1

# 3. Check basket total
npm run groc -- basket --json

# 4. Find and book a delivery slot
npm run groc -- slots --json
npm run groc -- book SLOT_ID

# 5. Preview, show the user, and place only once they approve
npm run groc -- checkout --dry-run
npm run groc -- checkout --yes
```

## Limitations

- UK Sainsbury's delivery areas only
- SMS 2FA required on every fresh login
- Some checkout endpoints are still experimental
- Slot removal endpoint returns 405 (known issue)
- Age-restricted items may need ID verification
