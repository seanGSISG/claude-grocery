# Slack setup

The bot runs in Socket Mode, so the homelab needs no public endpoint and no
inbound firewall rule.

## Create the app (once, ~5 minutes)

1. https://api.slack.com/apps → **Create New App** → From scratch. Name it
   "Meal Planner", pick your workspace.
2. **Socket Mode** → toggle on. Generate an app-level token named `socket` with
   scope `connections:write`. That token starts `xapp-` → `SLACK_APP_TOKEN`.
3. **OAuth & Permissions** → Bot Token Scopes:
   - `chat:write` — post the plan
   - `im:history`, `im:read`, `im:write` — take replies in a DM
   - `app_mentions:read` — respond to @mentions in a channel
   - `channels:history` if you'd rather use a private channel than a DM
4. **Event Subscriptions** → toggle on, subscribe to bot events:
   `message.im` and `app_mention`.
5. **Interactivity & Shortcuts** → toggle on (needed for the Approve button;
   Socket Mode handles delivery, so no Request URL).
6. **App Home** → **Show Tabs** → turn on **Messages Tab**, then tick
   **Allow users to send Slash commands and messages from the messages tab**.
   Without that checkbox Slack shows "Sending messages to this app has been
   turned off" and swallows every reply. Reload Slack (Cmd+R) after changing it.
7. **Install to Workspace**. The bot token starts `xoxb-` → `SLACK_BOT_TOKEN`.
8. Your own member ID (Slack profile → More → Copy member ID, starts `U`) →
   `SLACK_USER_ID`.

Store all three in 1Password and add them to `.env.op`:

```
SLACK_BOT_TOKEN=op://tynet/slack.mealplanner/bot_token
SLACK_APP_TOKEN=op://tynet/slack.mealplanner/app_token
SLACK_USER_ID=U0123456789
SLACK_CHANNEL=D0123456789   # the DM or channel the Saturday plan goes to
```

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "Sending messages to this app has been turned off" | Messages Tab, or its send checkbox, is off in App Home |
| `missing_scope` in the log | A bot scope was added after installing — add it, then Reinstall |
| Plan posts but buttons do nothing | Interactivity is off |
| Nothing at all, no error | Socket Mode off, or the `xapp-` token is from a different app |

## Sharing it with the household

Both adults drive the planner: plan, edit, approve, cancel. Every change is
posted with the name attached ("@joslin changed: Swap Tuesday for tacos"), and
approval says who approved.

1. Invite the other person to the workspace as a normal member.
2. Create a private channel (e.g. `#meal-planner`) with both of you in it, and
   invite the bot: `/invite @Meal Planner`.
3. Add their member ID to `SLACK_ALLOWED_USERS` (comma-separated) and the
   channel ID to `SLACK_CHANNEL` in 1Password.
4. For a **private** channel the app needs two more things, or it will see
   nothing there:
   - Bot Token Scope `groups:history` (and `groups:read`)
   - Event subscription `message.groups`
   Add both, then **Reinstall** the app.
   (A public channel wants `channels:history` and `message.channels` instead.)

Anyone not on the list gets "Only the household can change the grocery order."
The list is the whole security model — the bot fills a real cart, so keep it to
people you would hand your phone to.

## Run it

```sh
op run --env-file=.env.op -- npm run slack:dev
```

Then DM the bot `plan`.

## What it does

| You say | It does |
| --- | --- |
| `plan` | Builds and posts this week's plan |
| `ok`, `yes`, `looks good`, 👍 | Fills the Kroger cart, tells you to check out in the app |
| `swap tue for tacos` | Replaces Tuesday's meal, re-prices, reposts |
| `no cilantro` | Drops that item from the list |
| `add 2 avocados` | Adds it |
| `make it 3 avocados` | Changes the quantity |
| `skip thursday` | No dinner cooked that night |
| `wrong: boston butt` | Rejects the product that line matched, picks another, and never buys that one for it again |
| `cancel` | Drops the week; nothing is ordered |
| `help`, `?` | Posts the instructions |

Several instructions in one message work: *"swap tue for tacos, no cilantro,
add 2 avocados"*. Anything it can't parse comes back as a question rather than
a guess — it never invents an edit.

### Why it ignores most of what you say

The bot reads every message in the channel, and two of its actions — filling the
cart and cancelling the week — cannot be undone. So approval and refusal are
matched against a *whole* message or clause, never as a prefix: `ok` approves,
but "ok I'll be home late" does not; `stop` cancels, but "stop by the store for
milk" does not. For the same reason it will not act on an approval that arrives
in a message it only partly understood — it says what it didn't follow and waits
for a plain `ok`.

`plan` likewise has to be the message, not a word inside one, so "is the plan
done?" no longer throws away the edits you just made. Anything else said while no
plan is on the table is treated as conversation and ignored.

Only the newest plan message is live. Approving from an older message in the
scrollback is refused with a pointer to the current one, because the basket it
shows is not the basket that would be ordered.

Everything runs one at a time. If you and Joslin reply at the same moment, the
second reply waits for the first to finish rather than racing it — without that,
two `ok`s a second apart filled the cart twice, and the Cart API has no way to
undo an add.

### What the plan looks like

The week comes through as a table — day, dinner, serving time, and how far the
recipe is being scaled — inside a code block, because Slack has no table markup
and a code block is the only thing that lines up the same on a phone as on a
desktop. The scale column disappears when nothing is being scaled. Under it sits
one line of caveats: which nights are eaten in shifts or out of the slow cooker,
and why the calendar killed a night.

The bot posts its own instructions the first time it speaks in a channel, on
`help`, and on the *How this works* button, so neither of you has to remember the
syntax. `server/slack/help.ts` holds that text; it and this table should say the
same thing.

*Show list* prints the order one section per meal, then ingredients two meals
share, then staples — and the staples are split by aisle (Produce, Dairy, Bakery,
Frozen, and so on, in the order `DEPARTMENTS` lists them) because that section
runs to forty lines and one flat column is unreadable in the store.

Fresh produce and raw meat are never added as staples, however often history
shows them coming home: onions, broccoli, ground beef, beef chuck and chicken
come from a recipe or from someone asking, never from a rhythm. Prepared and pantry versions
of the same words are unaffected — frozen chicken nuggets, chicken broth and sour
cream and onion chips are still staples. The rule is `isRecipeOnly` in
`server/config/household.ts`; add a pattern there to exclude another cut.

Amounts are always US units. Recipes state grams and millilitres and the
aggregator keeps grams internally, so the conversion happens at display time:
`1360 g` reads as `3 lb`, `946 ml` of broth as `1 quart`, `90 ml` of soy sauce as
`1/3 cup`. Fractions are the ones a kitchen uses — no decimals.

### Bad matches

The store's search sometimes returns something absurd — Kerrygold butter for
"boneless Boston butt", fruit punch for "lemon juice". Say so and it sticks:

> `wrong: boston butt`
> `bad match on lemon juice`
> `the butter is wrong`
> `wrong: lemon juice - that's a fruit punch` (the note goes in the record)

You can name the ingredient as the list writes it, or the product that came
back. The bot records the rejected UPC in `match_feedback`, re-searches that one
line, and replies with the replacement (or says nothing else matched, so you can
add it yourself). Because the rejection is stored by ingredient, it holds for
every future week too — the same wrong product never comes back.

Either adult can report one; the record keeps who did.

## Safety

- Only `SLACK_USER_ID` and anyone in `SLACK_ALLOWED_USERS` can drive it. Anyone
  else gets a polite refusal.
- What gets ordered is exactly what was priced and shown. Approval sends the
  stored basket rather than re-searching, so the cart cannot quietly differ from
  the list you read.
- A handler that fails says so in the channel. Silence used to mean "say it
  again", and saying `ok` again was the one thing that could double an order.
- Approval is required before the cart is touched; there is no auto-order path.
- A basket over the hard cap refuses approval outright and asks what to cut.
- The bot cannot check out. Placing the order stays a human step in the app.
