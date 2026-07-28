## Agent Integration Guide

This document explains how to integrate Sainsbury's CLI into AI agent frameworks.

---

## Supported Frameworks

- ✅ **OpenClaw** / **Clawdbot** - Skills system
- ✅ **Pi Agent** / **Mom** - Slack bot with skills
- ✅ **Claude Desktop** - MCP server (future)
- ✅ **Custom agents** - Any framework that can call bash
- ✅ **Frona** - Skills installed from this repo, or the MCP server — see [`docs/FRONA.md`](./docs/FRONA.md)

---

## Quick Integration

### 1. Add as Skill

Copy to your agent's skills directory:

```bash
cp -r sainsburys-cli /path/to/agent/skills/
```

### 2. Agent Calls Commands

```typescript
// From your agent code
await bash("cd skills/sainsburys-cli && npm run groc -- search 'milk'");
```

### 3. Parse JSON Responses

```typescript
const stdout = await bash("cd skills/sainsburys-cli && npm run groc -- search 'milk' --json");
const results = JSON.parse(stdout);

results.products.forEach(product => {
  console.log(`${product.name} - £${product.retail_price.price}`);
});
```

---

## Skill File Format

The `SKILL.md` files follow the open skills format used by OpenClaw, Pi, and other agent frameworks.

### Layout

One skill per directory, and the directory name must match the skill's `name`:

```text
skills/
├── sainsburys-groceries/SKILL.md
├── tesco-groceries/SKILL.md
├── ocado-groceries/SKILL.md
└── grocery-api/SKILL.md
```

### Frontmatter

```yaml
---
name: sainsburys-groceries
description: "Sainsbury's UK grocery automation. Use when the user wants to shop at Sainsbury's, check prices, manage their basket, or place an order."
license: MIT
compatibility: "Node.js 18+, Playwright for login. UK Sainsbury's delivery areas only."
allowed-tools: Bash(npm:*), Bash(npx:*)
metadata:
  author: zish
  version: "2.1.0"
  tags: "groceries, sainsburys, uk"
---
```

Three rules worth knowing, because hosts differ on them:

- Recognised top-level keys are `name`, `description`, `license`, `compatibility`,
  `metadata`, and `allowed-tools`. Anything else is ignored.
- **`metadata` values must be strings.** A YAML list (`tags: [a, b]`) makes strict
  parsers reject the whole file — Frona is one of them.
- **`allowed-tools` splits differently per host:** Claude Code splits on commas, the
  `agent-skills` crate splits on whitespace. Keep each rule token space-free
  (`Bash(npm:*)`, not `Bash(npm run groc:*)`) so the value survives either. The
  colon syntax is a permission prefix, so `Bash(npm:*)`, never `Bash(npm:run:groc:*)`.

See [`docs/FRONA.md`](./docs/FRONA.md) for the Frona specifics.

### Triggers

Agent should load this skill when user:
- Mentions meal planning or groceries
- Asks "what's for dinner?"
- Wants to order food/shopping
- Talks about recipes or cooking
- Mentions Sainsbury's

---

## Natural Language Workflow

### User Intent Detection

```typescript
const intents = {
  mealPlanning: ["plan meals", "what should I cook", "dinner ideas"],
  shopping: ["add to basket", "order groceries", "buy milk"],
  delivery: ["book slot", "delivery Tuesday", "checkout"],
  query: ["what's in my basket", "show orders", "search for bread"]
};

if (userMessage.match(/plan meals|what.*cook|dinner ideas/i)) {
  await startMealPlanning();
}
```

### Meal Planning Flow

```typescript
async function startMealPlanning() {
  // 1. Ask constraints
  await ask("How many people? Budget? Dietary restrictions?");
  
  // 2. Suggest meals
  const meals = await suggestMeals({
    people: 2,
    budget: 50,
    dietary: ["halal"]
  });
  
  // 3. Get approval
  await showMeals(meals);
  const approved = await waitForApproval();
  
  // 4. Generate shopping list
  const ingredients = extractIngredients(approved);
  
  // 5. Search products
  for (const ingredient of ingredients) {
    const result = await bash(`cd skills/sainsburys-cli && npm run groc -- search "${ingredient}" --json`);
    const products = JSON.parse(result);
    const best = pickBestMatch(products, ingredient);
    shoppingList.push(best);
  }
  
  // 6. Show list and add to basket
  await showShoppingList(shoppingList);
  if (await confirm("Add to basket?")) {
    for (const item of shoppingList) {
      await bash(`cd skills/sainsburys-cli && npm run groc -- add ${item.product_uid} --qty ${item.quantity}`);
    }
  }
  
  // 7. Book a slot — safe to do autonomously
  await bash(`cd skills/sainsburys-cli && npm run groc -- basket --json`);
  const slots = JSON.parse(await bash(`cd skills/sainsburys-cli && npm run groc -- slots --json`));
  await bash(`cd skills/sainsburys-cli && npm run groc -- book ${slots[0].slot_id}`);

  // 8. Preview the order, show the human, and place it only if they approve
  const preview = await bash(`cd skills/sainsburys-cli && npm run groc -- checkout --dry-run`);
  await showOrderPreview(preview);
  if (await confirm("Place this order?")) {
    await bash(`cd skills/sainsburys-cli && npm run groc -- checkout --yes`);
  }
}
```

---

## Human Approval Before Ordering

Everything up to the order is autonomous: search, price comparison, basket edits,
and slot booking. Placing the order spends the user's money, so it is gated.

**CLI:** `groc checkout` refuses to run on its own. Preview with
`groc checkout --dry-run`, show the human, then place it with `groc checkout --yes`.

**MCP:** `grocery_checkout` takes two calls. `dry_run: true` (the default) returns
the line items, total, and booked slot together with a single-use
`confirmation_code`; `dry_run: false` needs that code back. The code expires after
10 minutes, is bound to the provider and to the exact basket that was previewed,
and cannot be replayed — so an agent cannot place an order the user never saw, and
an approval for one basket cannot be spent on another.

Never pass `--yes` or `dry_run: false` on your own initiative.

---

## Block Kit Integration (Slack Bots)

For Slack agents like Pi/Mom, use Block Kit for rich UIs.

### Shopping List

```javascript
async function showShoppingList(items, total) {
  const blocks = [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "🛒 Your Shopping List"}
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `*Total: £${total}* (${items.length} items)`
      }
    },
    {"type": "divider"},
    ...buildItemSections(items),
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "Add All to Basket"},
          "action_id": "add_to_basket",
          "style": "primary"
        },
        {
          "type": "button",
          "text": {"type": "plain_text", "text": "Modify List"},
          "action_id": "modify_list"
        }
      ]
    }
  ];
  
  await sendBlocks(blocks);
}

function buildItemSections(items) {
  const categories = groupByCategory(items);
  const sections = [];
  
  for (const [category, products] of Object.entries(categories)) {
    const itemsText = products
      .map(p => `• ${p.name} - £${p.price}`)
      .join('\n');
    
    sections.push({
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": `*${category}*\n${itemsText}`
        }
      ]
    });
  }
  
  return sections;
}
```

### Basket Summary

```javascript
async function showBasket(basket) {
  const blocks = [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `*🛒 Your Basket*\n\n*${basket.total_quantity} items* | *£${basket.total_cost}*`
      }
    },
    {"type": "divider"}
  ];
  
  // Group items
  basket.products.slice(0, 10).forEach(item => {
    blocks.push({
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `*${item.quantity}x* ${item.name}\n£${item.unit_price} each`
      },
      "accessory": {
        "type": "button",
        "text": {"type": "plain_text", "text": "Remove"},
        "action_id": `remove_${item.item_id}`,
        "style": "danger"
      }
    });
  });
  
  if (basket.products.length > 10) {
    blocks.push({
      "type": "context",
      "elements": [{
        "type": "mrkdwn",
        "text": `... and ${basket.products.length - 10} more items`
      }]
    });
  }
  
  blocks.push({
    "type": "actions",
    "elements": [
      {
        "type": "button",
        "text": {"type": "plain_text", "text": "Checkout"},
        "action_id": "checkout",
        "style": "primary"
      },
      {
        "type": "button",
        "text": {"type": "plain_text", "text": "Clear Basket"},
        "action_id": "clear_basket",
        "style": "danger"
      }
    ]
  });
  
  await sendBlocks(blocks);
}
```

### Delivery Slots

```javascript
async function showDeliverySlots(slots) {
  const blocks = [
    {
      "type": "header",
      "text": {"type": "plain_text", "text": "📅 Available Delivery Slots"}
    }
  ];
  
  slots.forEach(slot => {
    blocks.push({
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": `*${slot.date}*\n${slot.startTime} - ${slot.endTime}\n£${slot.price}`
      },
      "accessory": {
        "type": "button",
        "text": {"type": "plain_text", "text": "Book This"},
        "action_id": `book_${slot.id}`,
        "style": "primary"
      }
    });
  });
  
  await sendBlocks(blocks);
}
```

---

## Dietary Preferences (Optional Agent Logic)

If your agent implements meal planning, you can add preference handling.

### Configuration

Load preferences when user mentions dietary requirements:

```typescript
const preferences = {
  dietary_restrictions: ["vegetarian", "gluten-free"],
  dislikes: ["mushrooms", "olives"],
  budget: {weekly: 50},
  household_size: 2
};

savePreferences(preferences);
```

### Special Sourcing Example

Some users need specific sourcing (halal, kosher, local farms):

```typescript
const preferences = {
  dietary_restrictions: ["halal"],
  external_sources: {
    meat: "halal_butcher",
    note: "Exclude non-halal meat from Sainsbury's"
  },
  sainsburys_excludes: ["beef", "lamb", "chicken", "turkey"]
};
```

### Filter Search Results

```typescript
async function searchWithPreferences(query, preferences) {
  // Search Sainsbury's
  const result = await bash(`cd skills/sainsburys-cli && npm run groc -- search "${query}" --json`);
  const products = JSON.parse(result);
  
  // Filter based on preferences
  const filtered = products.products.filter(product => {
    // Example: exclude restricted items
    if (preferences.sainsburys_excludes) {
      for (const excluded of preferences.sainsburys_excludes) {
        if (product.name.toLowerCase().includes(excluded)) {
          return false;
        }
      }
    }
    return true;
  });
  
  return filtered;
}
```

### Split Shopping Lists

For users with external sourcing needs:

```typescript
async function generateShoppingList(meals, preferences) {
  const sainsburys = [];
  const external = {};
  
  for (const meal of meals) {
    for (const ingredient of meal.ingredients) {
      // Check if should be sourced externally
      const externalSource = shouldSourceExternally(ingredient, preferences);
      
      if (externalSource) {
        if (!external[externalSource]) external[externalSource] = [];
        external[externalSource].push({
          item: ingredient,
          meal: meal.name
        });
      } else {
        sainsburys.push(ingredient);
      }
    }
  }
  
  return {sainsburys, external};
}
```

### Display Split Lists (Block Kit)

```javascript
{
  "type": "section",
  "fields": [
    {
      "type": "mrkdwn",
      "text": "*From Sainsbury's:*\n• Pasta\n• Tomatoes\n• Onions\n• Herbs"
    },
    {
      "type": "mrkdwn",
      "text": "*From Other Sources:*\n• Local Farm: Eggs\n• Halal Butcher: Chicken\n_(Purchased separately)_"
    }
  ]
}
```

**Note:** This is your agent's logic, not CLI functionality. The CLI just provides product search and ordering.

---

## Error Handling

### Session Expired

```typescript
try {
  await bash("cd skills/sainsburys-cli && npm run groc -- basket --json");
} catch (error) {
  if (error.includes("401") || error.includes("403")) {
    await say("Session expired. Let me log you in again...");
    await bash(`cd skills/sainsburys-cli && npm run groc -- login --email ${EMAIL} --password ${PASSWORD}`);
    // Retry
    await bash("cd skills/sainsburys-cli && npm run groc -- basket --json");
  }
}
```

### Product Not Found

```typescript
const result = await bash(`cd skills/sainsburys-cli && npm run groc -- search "${ingredient}" --json`);
const products = JSON.parse(result);

if (products.products.length === 0) {
  await say(`Couldn't find "${ingredient}". Can you be more specific? (e.g., brand, size)`);
  const clarification = await waitForResponse();
  // Retry search
}
```

### Out of Stock

```typescript
const product = products.products[0];

if (!product.in_stock) {
  await say(`${product.name} is out of stock. Here are alternatives:`);
  const alternatives = products.products.slice(1, 4);
  // Show alternatives
}
```

---

## Performance Tips

### Cache Product Searches

```typescript
const searchCache = new Map();

async function searchProduct(query) {
  if (searchCache.has(query)) {
    return searchCache.get(query);
  }
  
  const result = await bash(`cd skills/sainsburys-cli && npm run groc -- search "${query}" --json`);
  const products = JSON.parse(result);
  
  searchCache.set(query, products);
  setTimeout(() => searchCache.delete(query), 60 * 60 * 1000); // 1 hour
  
  return products;
}
```

### Batch Basket Operations

```typescript
// Instead of:
for (const item of items) {
  await bash(`npm run groc -- add ${item.id} --qty ${item.qty}`);
}

// Do:
await Promise.all(
  items.map(item => 
    bash(`npm run groc -- add ${item.id} --qty ${item.qty}`)
  )
);
```

---

## MCP Server (Future)

Could be wrapped as an MCP server:

```typescript
// server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server({
  name: "sainsburys-groceries",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "sainsburys_search",
      description: "Search Sainsbury's products",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" }
        }
      }
    },
    {
      name: "sainsburys_add_to_basket",
      description: "Add product to basket",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string" },
          quantity: { type: "number" }
        }
      }
    }
    // ... more tools
  ]
}));

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case "sainsburys_search":
      return await search(args.query, args.limit);
    case "sainsburys_add_to_basket":
      return await addToBasket(args.productId, args.quantity);
  }
});
```

---

## Testing Your Integration

### 1. Test Basic Commands

```bash
cd skills/sainsburys-cli
npm run groc -- search "test"
npm run groc -- basket
```

### 2. Test From Agent

```typescript
// In your agent code
const result = await bash("cd skills/sainsburys-cli && npm run groc -- search 'milk' --json");
console.log(JSON.parse(result));
```

### 3. Test Full Workflow

```typescript
// Login
await bash("cd skills/sainsburys-cli && npm run groc -- login --email test@example.com --password test123");

// Search and add
const products = await bash("cd skills/sainsburys-cli && npm run groc -- search 'milk' --json");
const firstProduct = JSON.parse(products).products[0];
await bash(`cd skills/sainsburys-cli && npm run groc -- add ${firstProduct.product_uid} --qty 2`);

// View basket
const basket = await bash("cd skills/sainsburys-cli && npm run groc -- basket --json");
console.log(JSON.parse(basket));
```

---

## Example Integrations

### OpenClaw

```typescript
// skills/sainsburys-groceries/SKILL.md loaded automatically

// Agent uses natural language
user: "plan meals for this week"

agent: 
  → loads skill
  → asks constraints
  → suggests meals
  → searches Sainsbury's
  → builds basket
  → checks out
```

### Pi Agent (Slack)

```typescript
// data/skills/sainsburys-groceries/SKILL.md

// In meal-planning channel
await bash("cd skills/sainsburys-groceries && npm run groc -- search 'milk' --json");

// Show results with Block Kit
await sendBlocks(productBlocks);
```

---

## Support

**Issues:** GitHub issues  
**Docs:** README.md, SKILL.md, AGENTS.md  
**Examples:** See `/examples` directory

---

**Happy agent building! 🤖**
