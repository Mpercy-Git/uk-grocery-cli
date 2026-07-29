---
name: uk-grocery-cli
description: "Multi-supermarket UK grocery automation. Use when the user wants to plan a shop, compare grocery prices across Sainsbury's, Ocado, and Tesco, manage a basket, book a delivery slot, or place an order. Available as a CLI, an MCP server, or agent skills."
license: MIT
compatibility: "Node.js 18+, TypeScript, Playwright for login. UK supermarket delivery areas."
allowed-tools: Bash(npm:*), Bash(npx:*)
metadata:
  author: zish
  version: "2.1.0"
  repository: https://github.com/abracadabra50/uk-grocery-cli
  tags: "groceries, sainsburys, ocado, tesco, uk, shopping, automation, mcp, agent-tool"
---

# UK Grocery CLI

Unified grocery automation across UK supermarkets, usable from the CLI, an MCP
server, or as agent skills.

Run every command below from the repository root — the directory containing `package.json`.

Keep the `--` after `npm run groc`: without it npm swallows any `--flag`, so
`npm run groc search "milk" --json` silently runs without `--json`. If you have
linked the CLI globally, `groc ...` takes the flags directly.

## When to use

- The user wants to plan meals or order groceries
- The user asks about product prices or availability
- The user wants to compare prices across supermarkets
- The user needs to manage a shopping basket
- The user wants to book a delivery slot or place an order
- The user asks about a weekly shop, meal prep, or grocery budget

## Per-supermarket skills

Each supermarket has its own skill with provider-specific commands, authentication, and API details:

| Supermarket | Skill | Coverage |
|-------------|-------|----------|
| **Sainsbury's** | [`skills/sainsburys-groceries`](skills/sainsburys-groceries/SKILL.md) | Full |
| **Tesco** | [`skills/tesco-groceries`](skills/tesco-groceries/SKILL.md) | Full, plus repeat-purchase staples |
| **Ocado** | [`skills/ocado-groceries`](skills/ocado-groceries/SKILL.md) | Full except slot booking and checkout (AWS WAF) |
| Sainsbury's (fast path) | [`skills/grocery-api`](skills/grocery-api/SKILL.md) | Search and basket over the local HTTP API |

## Setup

```bash
npm install
npx playwright install chromium
```

## CLI usage

```bash
# Search any supermarket
npm run groc -- --provider sainsburys search "milk"
npm run groc -- --provider tesco search "milk"
npm run groc -- --provider ocado search "milk"

# Compare across all stores
npm run groc -- compare "organic eggs" --json

# Provider is a flag — every command works the same way
npm run groc -- --provider <store> basket
npm run groc -- --provider <store> add <id> --qty 2
npm run groc -- --provider <store> slots
npm run groc -- --provider <store> checkout --dry-run
```

## MCP server usage

```bash
# stdio transport
npx tsx src/mcp-server.ts

# or after a build
node dist/mcp-server.js
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "uk-grocery": {
      "command": "node",
      "args": ["/path/to/uk-grocery-cli/dist/mcp-server.js"]
    }
  }
}
```

## Placing an order

Everything up to the order — searching, comparing, building the basket, booking a
slot — is safe to do autonomously. Placing the order is not: it spends the user's
money, so it always takes an explicit human approval.

**Over MCP,** `grocery_checkout` is a two-step tool:

1. Call it with `dry_run: true` (the default). It returns the line items, total,
   and booked slot, plus a single-use `confirmation_code`.
2. Show that preview to the user and ask them to approve it.
3. Only once they have, call it again with `dry_run: false` and the
   `confirmation_code`.

The code expires after 10 minutes, works only for the provider that issued it, and
is void if the basket changes in between — any of those means going back to step 1.

**From the CLI,** `checkout` refuses to run without a decision:

```bash
npm run groc -- --provider <store> checkout --dry-run   # Preview, show the user
npm run groc -- --provider <store> checkout --yes       # Place it, once they approve
```

Never pass `dry_run: false` or `--yes` on your own initiative.

**Running inside Frona,** collect that approval with the `ask_user_question` tool
(provider `human_in_the_loop`), which blocks until the user answers:

```json
{
  "question": "Place this Tesco order? 12 items, £48.20, delivered Thu 09:00-10:00.",
  "options": ["Place the order", "Cancel"]
}
```

Only run the confirming step if the answer is the approving option.
Setup and caveats: [`docs/FRONA.md`](docs/FRONA.md).

## MCP tools

Every tool takes a `provider` parameter (`sainsburys`, `ocado`, `tesco`), defaulting to `sainsburys`.

### Core tools

| Tool | Description |
|------|-------------|
| `grocery_login` | Login to a supermarket account |
| `grocery_status` | Check login status across all providers |
| `grocery_search` | Search products |
| `grocery_compare` | Compare prices across all stores |
| `grocery_basket_view` | View basket contents |
| `grocery_basket_add` | Add product to basket |
| `grocery_basket_remove` | Remove from basket |
| `grocery_basket_update` | Update item quantity |
| `grocery_basket_clear` | Clear basket |
| `grocery_slots` | List delivery slots |
| `grocery_book_slot` | Book a delivery slot |
| `grocery_checkout` | Preview, then place the order — requires user approval |
| `grocery_orders` | View order history |
| `grocery_favourites` | Favourite / frequently-bought products (Sainsbury's, Ocado) |
| `grocery_favourites_search` | Search within favourites (Sainsbury's, Ocado) |
| `grocery_categories` | List browse categories (Sainsbury's, Ocado) |
| `grocery_browse` | Browse products in a category (Ocado) |
| `grocery_providers` | List providers and login status |

### Provider-specific tools

| Tool | Description |
|------|-------------|
| `tesco_staples` | View, refresh, or auto-add repeat-purchase staples |
| `ocado_regulars` | List Ocado recurring-shopping ("Regulars") definitions |

## Example workflows

### Meal planning

```bash
# Compare ingredients across stores
npm run groc -- compare "chicken breast" --json
npm run groc -- compare "basmati rice" --json

# Build the basket at the cheapest provider
npm run groc -- --provider tesco add PRODUCT_ID --qty 1
npm run groc -- --provider tesco basket --json

# Preview, show the user, place only once they approve
npm run groc -- --provider tesco checkout --dry-run
npm run groc -- --provider tesco checkout --yes
```

### Restock staples (Tesco)

```bash
npm run groc -- --provider tesco staples --add
npm run groc -- --provider tesco basket --json
npm run groc -- --provider tesco checkout --dry-run
```

### Price comparison

```bash
npm run groc -- compare "organic milk" --json   # Results from every provider
```

## Documentation

- [`skills/sainsburys-groceries/SKILL.md`](skills/sainsburys-groceries/SKILL.md) — Sainsbury's skill
- [`skills/tesco-groceries/SKILL.md`](skills/tesco-groceries/SKILL.md) — Tesco skill
- [`skills/ocado-groceries/SKILL.md`](skills/ocado-groceries/SKILL.md) — Ocado skill
- [`skills/grocery-api/SKILL.md`](skills/grocery-api/SKILL.md) — local HTTP API skill
- [`AGENTS.md`](AGENTS.md) — full agent integration guide
- [`docs/FRONA.md`](docs/FRONA.md) — installing on Frona (skills, MCP, order approval)
- [`docs/SMART-SHOPPING.md`](docs/SMART-SHOPPING.md) — smart shopping decisions
- [`API-REFERENCE.md`](API-REFERENCE.md) — API endpoint documentation
