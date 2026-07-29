---
name: tesco-groceries
description: "Tesco UK grocery automation. Use when the user wants to shop at Tesco, check Tesco prices or stock, manage their Tesco basket, reorder repeat-purchase staples, book a delivery slot, or place an order."
license: MIT
compatibility: "Node.js 18+, TypeScript, Playwright for login, slots, and checkout. UK Tesco delivery areas only."
allowed-tools: Bash(npm:*), Bash(npx:*)
metadata:
  author: zish
  version: "2.1.0"
  repository: https://github.com/abracadabra50/uk-grocery-cli
  tags: "groceries, tesco, uk, shopping, automation, mcp, agent-tool"
---

# Tesco Groceries

Search products, manage the basket, book delivery slots, place orders, and manage repeat-purchase staples at Tesco.

Run every command below from the repository root — the directory containing `package.json`.

Keep the `--` after `npm run groc`: without it npm swallows any `--flag`, so
`npm run groc search "milk" --json` silently runs without `--json`. If you have
linked the CLI globally, `groc ...` takes the flags directly.

## When to use

- The user wants to buy groceries from Tesco
- The user asks about product prices or availability at Tesco
- The user wants to manage their Tesco basket
- The user needs to book a Tesco delivery slot
- The user wants to reorder their regular staples from Tesco
- The user wants to place a Tesco order

## Setup

```bash
npm install
npx playwright install chromium
```

## Authentication

Tesco uses Akamai bot detection, so there are three routes in.

**Option 1 — automated login (may be blocked by Akamai):**

```bash
npm run groc -- --provider tesco login --email EMAIL --password PASS

# Omit --password to be prompted interactively
npm run groc -- --provider tesco login --email EMAIL
```

**Option 2 — import a browser session (recommended):**

```bash
# 1. Log in to tesco.com manually in Chrome/Firefox
# 2. Export cookies with the "Cookie Editor" extension -> Export All -> JSON
# 3. Import them:
npm run groc -- --provider tesco import-session --file ~/Downloads/tesco-cookies.json
```

**Option 3 — password from the environment:**

```bash
TESCO_PASSWORD=yourpass npm run groc -- --provider tesco login --email EMAIL
```

The session is saved to `~/.tesco/session.json` and lasts about 7 days.

## CLI commands

All commands need `--provider tesco`.

### Search

```bash
npm run groc -- --provider tesco search "semi-skimmed milk"
npm run groc -- --provider tesco search "bread" --limit 10 --json
```

### Basket

```bash
npm run groc -- --provider tesco basket                    # View basket
npm run groc -- --provider tesco basket --json             # JSON output
npm run groc -- --provider tesco add <product-id> --qty 2  # Add item
npm run groc -- --provider tesco update <item-id> 3        # Update quantity
npm run groc -- --provider tesco remove <item-id>          # Remove item
npm run groc -- --provider tesco clear --force             # Clear basket
```

Use `product_uid` for `add`, and the basket `item_id` for `update` and `remove`.

### Delivery and orders

```bash
npm run groc -- --provider tesco slots                     # View slots
npm run groc -- --provider tesco slots --json              # JSON output
npm run groc -- --provider tesco book <slot-id>            # Book slot
npm run groc -- --provider tesco checkout --dry-run        # Preview the order
npm run groc -- --provider tesco checkout --yes            # Place it (needs user approval first)
npm run groc -- --provider tesco orders                    # Order history
```

### Staples (Tesco only)

```bash
npm run groc -- --provider tesco staples           # View repeat purchases from order history
npm run groc -- --provider tesco staples --update  # Refresh from latest order history
npm run groc -- --provider tesco staples --add     # Add all staples to basket (skips items already in it)
npm run groc -- --provider tesco staples --json    # JSON output
```

### Session import and API discovery (Tesco only)

```bash
npm run groc -- --provider tesco import-session --file <cookies.json>
npm run groc -- --provider tesco discover          # Dev helper
```

## Placing an order

Search, basket edits, staples, and slot booking can all be done autonomously.
Placing the order cannot — it spends the user's money and needs their explicit
approval.

1. Preview: `npm run groc -- --provider tesco checkout --dry-run`.
2. Show the user the items, the total, and the delivery slot.
3. Only after they approve, place it: `npm run groc -- --provider tesco checkout --yes`.

Plain `checkout` refuses to run and prints these steps. Over MCP the same gate is
enforced by `grocery_checkout` (see below). Tesco also never auto-completes
payment — the payment step itself is confirmed by the user.

**Running inside Frona:** collect the approval with the `ask_user_question` tool
(provider `human_in_the_loop`), which blocks until the user answers:

```json
{
  "question": "Place this Tesco order? 12 items, £48.20, delivered Thu 09:00-10:00.",
  "options": ["Place the order", "Cancel"]
}
```

Only run the confirming step if the answer is the approving option. See
[`docs/FRONA.md`](../../docs/FRONA.md).

## MCP tools

With the MCP server, pass `provider: "tesco"`:

| Tool | Description |
|------|-------------|
| `grocery_search` | Search Tesco products |
| `grocery_basket_view` | View basket contents |
| `grocery_basket_add` | Add product to basket |
| `grocery_basket_remove` | Remove product from basket |
| `grocery_basket_update` | Update item quantity |
| `grocery_basket_clear` | Clear all items |
| `grocery_slots` | List delivery slots |
| `grocery_book_slot` | Book a delivery slot |
| `grocery_checkout` | Preview, then place the order — requires user approval |
| `grocery_orders` | View order history |
| `grocery_login` | Login to Tesco |
| `tesco_staples` | View, refresh, or auto-add staples (Tesco only) |

`grocery_checkout` runs in two steps. Call it with `dry_run: true` (the default)
to get a preview and a single-use `confirmation_code`, show that preview to the
user, and only once they approve call it again with `dry_run: false` and that
code. The code expires after 10 minutes and is void if the basket changes.

## API details

Tesco uses **GraphQL** at `https://xapi.tesco.com/`:

- Operations: `SearchProducts`, `Basket`, `AddToBasket`, `GetOrders`, `Taxonomy`
- Required headers: `x-apikey`, `language: en-GB`, `region: UK`
- Requests are batched POSTs

Delivery slots and checkout go through Playwright browser automation instead.

## Example workflow

```bash
# 1. Check staples from order history
npm run groc -- --provider tesco staples --json

# 2. Add staples to the basket
npm run groc -- --provider tesco staples --add

# 3. Search for anything extra
npm run groc -- --provider tesco search "avocados" --json

# 4. Add the extra items
npm run groc -- --provider tesco add PRODUCT_ID --qty 2

# 5. Review the basket
npm run groc -- --provider tesco basket --json

# 6. Book a slot
npm run groc -- --provider tesco slots --json
npm run groc -- --provider tesco book SLOT_ID

# 7. Preview, show the user, and place only once they approve
npm run groc -- --provider tesco checkout --dry-run
npm run groc -- --provider tesco checkout --yes
```

## Limitations

- Akamai bot detection can block automated login — use `import-session`
- Slots and checkout need browser automation, so they take ~10-15 seconds
- Age-restricted items may need ID verification
- Payment completion always requires manual confirmation; it never auto-completes
