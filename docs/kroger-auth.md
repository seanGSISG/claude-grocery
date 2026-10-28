# Kroger authorization runbook

The Kroger app (`Alexander Family Meal Planner`, Production) uses two grants:

| Grant | Used for | Where the secret lives |
| --- | --- | --- |
| Client credentials | Products, Locations | `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` via `op run` |
| Authorization code | Cart, Identity | refresh token in `~/.config/claude-grocery/kroger-token.json` (0600) |

## First-time authorization (on the Mac)

```sh
cd ~/src/claude-grocery-kroger-agent
npm install
op run --env-file=.env.op -- npm run kroger:auth
```

The script listens on `http://localhost:8000/callback`, prints the consent URL and
waits. Nothing on the internet calls that URL: Kroger 302s the *browser*, which
resolves `localhost` on the machine it runs on. So this works as long as the
browser and the script are on the same machine.

If the browser can't reach the callback (different machine, port taken, a proxy
in the way), finish the consent anyway, copy the URL the browser lands on and run:

```sh
op run --env-file=.env.op -- npm run kroger:auth -- --code "http://localhost:8000/callback?code=..."
```

Codes are single-use and expire in minutes, so paste promptly.

## Store

Home store: **Wildcat Reserve, 2205 W Wildcat Reserve Pkwy, Highlands Ranch 80129
= locationId `62000008`** (division 620, store 00008). Set `KROGER_LOCATION_ID=62000008`
so product searches return that store's prices, availability and aisles.

Delivery orders are fulfilled from the Ocado facility `540FC007`, not from the
store shelf, so a delivery basket's assortment and prices can differ slightly
from what `62000008` reports. The Products API only accepts store locationIds,
so 62000008 is the closest proxy; treat its prices as estimates for the budget
check.

## Verify

```sh
op run --env-file=.env.op -- npm run kroger:smoke -- --zip 80126        # stores + prices
op run --env-file=.env.op -- npm run kroger:smoke -- --zip 80126 --add  # writes to the real cart
```

`--add` is the test of whether `cart.basic:write` works on the public tier. It
adds one item; remove it in the King Soopers app, since the API can only add.

## Moving the token to the homelab

The refresh token is portable. After authorizing on the Mac:

```sh
scp ~/.config/claude-grocery/kroger-token.json homelab:/srv/claude-grocery/
# in the container: KROGER_TOKEN_FILE=/srv/claude-grocery/kroger-token.json
```

The agent refreshes on its own from there and rewrites the file each time the
refresh token rotates, so that path must be writable and on persistent storage.

## Re-authorizing from the homelab

Kroger only accepts redirect URIs registered on the app, so a headless re-auth
needs a stable public HTTPS callback — a Cloudflare Tunnel hostname or a reserved
ngrok domain, added as a second redirect URI at developer.kroger.com, then set as
`KROGER_REDIRECT_URI`. Until then, re-auth on the Mac and copy the file again.

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Hundreds of `TS2307 Cannot find module` | `npm install` not run in this worktree | `npm install` (each worktree has its own `node_modules`) |
| `Port 8000 is already in use` | stale listener | `lsof -ti:8000 \| xargs kill`, or use `--code` |
| `invalid_grant` on exchange | code reused or expired | redo the consent |
| Refresh fails with 400 | refresh token revoked or rotated away | re-run `kroger:auth` |
| Cart add returns 403 | `cart.basic:write` not granted on this tier | fall back to a Slack checklist; see the plan doc |
