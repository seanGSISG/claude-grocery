// Resume capture: the 63 delivery/pickup receipts not yet captured.
// Paste at https://www.kingsoopers.com/mypurchases (signed in). ~8 minutes.
// Slower than the first pass (7s +/- jitter) because the site throttled it;
// it also stops early after 5 consecutive failures so you can resume later.
// Downloads ks-purchase-details-2.json — keep both files, the importer merges them.
const KEYS = [
  "540~00071~2026-08-13~1460~11431001",
  "540~00071~2026-08-06~1460~8180814",
  "540~00071~2026-07-30~1460~37672033",
  "540~00071~2026-07-24~1460~9680748",
  "540~00071~2026-07-17~1460~35161522",
  "540~00071~2026-07-08~1460~28371713",
  "540~00071~2026-07-01~1460~10060923",
  "540~00071~2026-06-23~1460~36331921",
  "540~00071~2026-06-12~1460~14100910",
  "540~00071~2026-06-08~1460~37691638",
  "540~00071~2026-05-27~1460~18711307",
  "540~00071~2026-05-18~1460~49042106",
  "540~00071~2026-05-14~1460~12151048",
  "540~00071~2026-05-03~1460~40391715",
  "540~00071~2026-04-21~1460~8790854",
  "540~00071~2026-02-02~1460~29141415",
  "540~00071~2026-01-14~1460~20631626",
  "540~00071~2026-01-05~1460~33181551",
  "540~00071~2025-12-29~1460~15441058",
  "540~00071~2025-12-18~1460~5540819",
  "540~00071~2025-12-03~1460~5771021",
  "540~00071~2025-11-25~1460~21611138",
  "540~00071~2025-11-25~1460~21441136",
  "540~00071~2025-11-18~1460~32802014",
  "540~00071~2025-11-10~1460~40932001",
  "540~00071~2025-10-28~1460~28381926",
  "540~00071~2025-10-22~1460~18601552",
  "540~00071~2025-10-03~1460~4090705",
  "540~00071~2025-09-24~1460~5360817",
  "540~00071~2025-09-08~1460~32241816",
  "540~00071~2025-08-25~1460~6690744",
  "540~00071~2025-08-15~1460~3950652",
  "540~00071~2025-08-04~1460~34061934",
  "540~00071~2025-07-17~1460~3110652",
  "540~00071~2025-07-07~1460~25811520",
  "540~00071~2025-07-03~1460~20151229",
  "540~00071~2025-06-19~1460~27472142",
  "540~00071~2025-05-24~1460~17381200",
  "540~00071~2025-05-20~1460~3960711",
  "540~00071~2025-05-19~1460~28221541",
  "540~00071~2025-05-10~1460~3480700",
  "540~00071~2025-04-24~1460~3710706",
  "540~00071~2025-04-15~1460~5050735",
  "540~00071~2025-04-08~1460~21081639",
  "540~00071~2025-03-31~1460~30401909",
  "540~00071~2025-03-25~1460~21911731",
  "540~00071~2025-03-13~1460~21711751",
  "540~00071~2025-03-01~1460~25051657",
  "540~00071~2025-02-19~1460~21491837",
  "540~00071~2025-02-07~1460~5550729",
  "540~00071~2025-01-22~1460~4890756",
  "540~00071~2025-01-06~1460~5510745",
  "540~00071~2024-12-30~1460~800605",
  "540~00071~2024-12-23~1460~25791456",
  "540~00071~2024-12-14~1460~22711610",
  "540~00071~2024-12-06~1460~17641142",
  "540~00071~2024-12-03~1460~5790800",
  "540~00071~2024-11-19~1460~4780749",
  "540~00071~2024-11-11~1460~4690720",
  "540~00071~2024-10-30~1460~3140725",
  "540~00071~2024-10-22~1460~4490748",
  "540~00071~2024-10-02~1460~5330811",
  "540~00071~2024-09-25~1460~3850755"
];

const out = {}, fails = [];
let streak = 0;
for (const key of KEYS) {
  const [divisionNumber, storeNumber, transactionDate, terminalNumber, transactionId] = key.split('~');
  try {
    const r = await fetch('/atlas/v1/purchase-history/v2/details', {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'X-Kroger-Channel': 'WEB',
        'x-call-origin': '{"page":"/mypurchases/detail","component":"purchase detail"}',
      },
      body: JSON.stringify([{ divisionNumber, storeNumber, transactionDate, terminalNumber, transactionId }]),
    });
    if (r.ok) { out[key] = (await r.json()).data.purchaseHistoryDetails[0]; streak = 0; }
    else { fails.push([key, r.status]); streak++; }
  } catch (e) { fails.push([key, String(e)]); streak++; }
  console.log(Object.keys(out).length + '/' + KEYS.length, fails.length ? '(' + fails.length + ' failed)' : '');
  if (streak >= 5) { console.warn('5 failures in a row — stopping. Reload the page and re-run later.'); break; }
  await new Promise(s => setTimeout(s, 7000 + Math.random() * 3000));
}
console.log('done. failed:', fails.map(f => f[0]));
const a = document.createElement('a');
a.href = URL.createObjectURL(new Blob([JSON.stringify({ capturedAt: new Date().toISOString(), details: out })], { type: 'application/json' }));
a.download = 'ks-purchase-details-2.json';
a.click();
