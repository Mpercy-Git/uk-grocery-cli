# Running this on Frona

[Frona](https://docs.frona.ai/) can consume this project two ways: as **agent skills**
installed straight from the GitHub repo, and as an **MCP server**. The skill route
works today; the MCP route needs the package published to npm first (see below).

Everything here was checked against Frona's own source — skill parsing in
`crates/frona-server/src/agent/skill/`, MCP installs in
`crates/frona-server/src/tool/mcp/`.

## Skills

Frona walks a repo for every `SKILL.md`, names each skill after its **directory**
(a root-level `SKILL.md` takes the repo name), and copies that directory's files
into the agent's workspace at `skills/<name>/`.

That gives this repo five installable skills:

| Skill | What the agent gets |
|-------|--------------------|
| `uk-grocery-cli` | Root skill — the **whole repo**, so `npm install && npm run groc -- …` works |
| `sainsburys-groceries` | Sainsbury's instructions only |
| `tesco-groceries` | Tesco instructions only |
| `ocado-groceries` | Ocado instructions only |
| `grocery-api` | Local HTTP API instructions plus `wrapper.js` |

**Install `uk-grocery-cli` first.** The per-supermarket skills are instructions, not
code: on their own their commands have nothing to run against. The root skill is what
puts `package.json` and `src/` in the agent's workspace.

Two things to know about how Frona fetches:

- It reads the **default branch** (`git clone --depth 1`, and raw URLs pinned to
  `main`). Skill edits on a feature branch are invisible until they land on `main`.
- It caches the clone for an hour before pulling again, so a fresh push can take
  that long to show up.

### Setting up in the agent's workspace

Frona's `shell` tool runs bash in the agent's sandboxed workspace, so:

```bash
cd skills/uk-grocery-cli
npm install
npx playwright install chromium    # only needed for login, Tesco slots, and checkout
npm run groc -- --provider sainsburys search "milk" --json
```

Session files land in the sandbox home (`~/.sainsburys/session.json` and friends).
If the sandbox blocks the interactive browser login, use the cookie-import path
(`import-session`) documented in each supermarket's skill.

## MCP server

Frona installs MCP servers from a registry manifest. [`server.json`](../server.json)
in the repo root is that manifest — paste it into Frona's "install from manifest"
flow, or publish it to the MCP registry and install by name.

Frona turns the manifest into:

```bash
npx --yes uk-grocery-cli@2.1.0
```

The package's `uk-grocery-cli` bin is the MCP server, so that command serves all 20
tools over stdio. (`groc`, `groc-mcp`, and `groc-api` still do what they always did.)

> **This needs `npm publish` first.** `uk-grocery-cli` is not on npm yet, so the
> install will fail at `npx` until it is. `npm publish` builds `dist/` first via
> `prepublishOnly`. Until then, use the skill route above.

Frona only accepts `npm` and `pypi` packages with a `stdio`, `streamable-http`, or
`sse` transport — there is no "run this local command" install path, which is why
publishing is the prerequisite.

### Credentials

The manifest declares these as secret environment variables, so Frona can bind them
from its vault at install time (binding an env var the manifest does *not* declare is
rejected):

| Variable | Use |
|----------|-----|
| `SAINSBURYS_EMAIL` / `SAINSBURYS_PASSWORD` | Headless re-auth when the Sainsbury's session expires |
| `TESCO_PASSWORD` | Tesco login when the password is not passed in the call |
| `GROC_EMAIL` / `GROC_PASSWORD` | Defaults for logins that do not specify an account |

`SAINSBURYS_STORE_NUMBER` is declared too, as a non-secret override.

## Approving an order

Search, price comparison, basket edits, and slot booking are all safe for the agent
to do alone. Placing the order is not, and Frona already has the right primitive:
the `ask_user_question` tool (provider `human_in_the_loop`) blocks until the user
answers.

The flow:

1. `grocery_checkout` with `dry_run: true` → line items, total, slot, and a
   single-use `confirmation_code`.
2. `ask_user_question` with that preview in the question:

   ```json
   {
     "question": "Place this Tesco order? 12 items, £48.20, delivered Thu 09:00-10:00.",
     "options": ["Place the order", "Cancel"]
   }
   ```

3. Only on the approving answer, `grocery_checkout` with `dry_run: false` and the
   `confirmation_code`.

The code is held in the MCP server process, expires after 10 minutes, is scoped to
one provider, and is void if the basket changed since the preview — so the approval
the user gave is the order that gets placed, or nothing does. A server restart
between steps 1 and 3 drops the code; re-run the preview.

Driving the CLI through the `shell` tool instead? Same shape: `checkout --dry-run`
to preview, ask, then `checkout --yes`. Bare `checkout` refuses to run.

Ocado has nothing to approve — slot booking and checkout are not implemented there
(AWS WAF), so the agent builds the trolley and hands off to ocado.com.

## Notes for editing these skills

Frona parses `SKILL.md` with the [`agent-skills`](https://crates.io/crates/agent-skills)
crate, which is stricter than it looks:

- **`metadata` is a string→string map.** A YAML list (`tags: [a, b]`) fails the whole
  parse and Frona rejects the skill outright. Keep every metadata value a string.
- **`compatibility` is a real top-level field** (≤500 chars), surfaced in Frona's
  skill preview alongside `license`. It does not belong under `metadata`.
- Recognised top-level keys are `name`, `description`, `license`, `compatibility`,
  `metadata`, and `allowed-tools`. Others are ignored.
- `name` must be lowercase alphanumeric plus hyphens, ≤64 chars, and match the
  directory name. `description` is capped at 1024 characters.
- **`allowed-tools` splits differently per host:** Claude Code splits on commas,
  `agent-skills` splits on whitespace. Rule tokens here avoid spaces
  (`Bash(npm:*)`, not `Bash(npm run groc:*)`) so the value stays sensible under
  either. Frona itself does not currently enforce the field.

To check a change before pushing:

```bash
cargo add agent-skills   # in a scratch crate
# then: agent_skills::Skill::parse(&std::fs::read_to_string("SKILL.md")?)
```
