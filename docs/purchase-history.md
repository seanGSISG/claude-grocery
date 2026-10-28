# Purchase-history capture

Kroger's public API has no order history, and the King Soopers receipt emails
carry only totals. The item data comes from the website's own endpoint, captured
while signed in at kingsoopers.com.

## Capture

Sign in, open https://www.kingsoopers.com/mypurchases, and run this in the
browser console (it pages through everything and downloads one JSON file):

```js
const all = [];
let page = 1, last = false;
while (!last && page < 40) {
  const r = await fetch(`/atlas/v1/post-order/v1/purchase-history-search?pageNo=${page}&pageSize=25`,
    { credentials: 'include', headers: { Accept: 'application/json' } });
  const s = (await r.json()).data.postOrderSearch;
  all.push(...s.data);
  last = s.isLastPage;
  page++;
}
const payload = {
  source: 'kingsoopers.com /atlas/v1/post-order/v1/purchase-history-search',
  capturedAt: new Date().toISOString(),
  receiptCount: all.length,
  receipts: all.map(x => ({
    date: x.createdDateTime.value, type: x.purchaseType, status: x.status,
    storeId: x.handoffStoreId, total: x.total, receiptKey: x.receiptKey,
    upcs: (x.lineItems || []).map(li => li.upc),
  })),
};
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
a.download = 'ks-purchase-history.json';
a.click();
```

Move the file to `data/ks-purchase-history.json`. It is gitignored: it is a
two-year record of what the household eats, and the fork is public.

## Step 2: receipt details (quantities and prices)

The summary endpoint gives UPCs only. Item quantities, unit prices, coupons and
fees come from the detail endpoint the /mypurchases/detail/<receiptKey> page
uses:

```
POST /atlas/v1/purchase-history/v2/details
Content-Type: application/json
X-Kroger-Channel: WEB
x-call-origin: {"page":"/mypurchases/detail","component":"purchase detail"}

[{"divisionNumber":"540","storeNumber":"00071","transactionDate":"2026-09-12",
  "terminalNumber":"1460","transactionId":"7860801"}]
```

The five fields are the `receiptKey` split on `~`. The response carries
`costSummary` (total, tax, savings, coupons, bag and delivery fees, subtotal)
and `items[]` with `purchasedData` per line.

Run this in your own browser (signed in, on /mypurchases). It paces itself at
~2.5s per receipt because the site is behind bot protection that starts
refusing scripted bursts:

```js
const hist = JSON.parse(await (await fetch('/atlas/v1/post-order/v1/purchase-history-search?pageNo=1&pageSize=25',
  {credentials:'include'})).text()); // warm up
const keys = JSON.parse(localStorage.getItem('__ksKeys') || '[]'); // or paste your basket receiptKeys here
const out = {}, fails = [];
for (const key of keys) {
  const [divisionNumber, storeNumber, transactionDate, terminalNumber, transactionId] = key.split('~');
  try {
    const r = await fetch('/atlas/v1/purchase-history/v2/details', {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type':'application/json','Accept':'application/json, text/plain, */*',
                'X-Kroger-Channel':'WEB','x-call-origin':'{"page":"/mypurchases/detail","component":"purchase detail"}'},
      body: JSON.stringify([{divisionNumber, storeNumber, transactionDate, terminalNumber, transactionId}]),
    });
    if (r.ok) out[key] = (await r.json()).data.purchaseHistoryDetails[0];
    else fails.push([key, r.status]);
  } catch (e) { fails.push([key, String(e)]); }
  await new Promise(s => setTimeout(s, 2500));
}
console.log('captured', Object.keys(out).length, 'failed', fails);
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([JSON.stringify({capturedAt:new Date().toISOString(), details: out})], {type:'application/json'}));
a.download = 'ks-purchase-details.json';
a.click();
```

Save it as `data/ks-purchase-details.json`. If some receipts fail, re-run for
just those keys; the capture merges.

## What the endpoints give (and don't)

Each receipt carries date, type (DELIVERY / PICKUP / IN_STORE / FUEL), store,
total and a list of UPCs. **No quantities, no per-item prices, no product names.**
Names and prices come from the Kroger Products API at import time; quantities
are a gap the agent's own `cart_ledger` closes going forward.

Detail responses add quantity and price per line, so `data/ks-purchase-details.json`
supersedes the UPC-only view where it exists. The site's product endpoint refuses
calls without its internal LAF headers, so product names still come from the
official Products API. Note the detail page only works when reached by clicking
through from /mypurchases — a direct page load errors out.

## Import

```sh
npm run history:import -- --file data/ks-purchase-history.json
op run --env-file=.env.op -- npm run history:import -- --resolve
```

The first pass fills `purchase_receipts`, `purchase_items` and
`purchase_upc_stats`. `--resolve` adds brand, description, size and current
price per UPC (set `KROGER_LOCATION_ID` first, or prices come back empty).

Only DELIVERY and PICKUP receipts count as "baskets" — fuel stops and two-item
in-store runs would otherwise drown out the weekly shop.
