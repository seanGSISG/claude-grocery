/**
 * Parser for the King Soopers receipt-detail payloads
 * (POST /atlas/v1/purchase-history/v2/details), captured per docs/purchase-history.md.
 *
 * These carry what the summary endpoint lacks: product name, size, quantity
 * received, unit price paid and savings per line.
 */

export interface DetailLine {
  upc: string;
  description: string | null;
  size: string | null;
  /** Units actually received (substitutions and refunds excluded). */
  quantity: number;
  unitPricePaid: number | null;
  totalPricePaid: number | null;
  savings: number | null;
  isWeighted: boolean;
}

export interface DetailReceipt {
  receiptKey: string;
  purchaseType: string | null;
  purchasedAt: string | null;
  itemCount: number;
  lines: DetailLine[];
  subTotal: number | null;
  total: number | null;
  savings: number | null;
  tax: number | null;
  feePaid: number | null;
}

export interface DetailsCapture {
  capturedAt?: string;
  details: Record<string, unknown>;
}

export function money(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function parseReceipt(receiptKey: string, raw: unknown): DetailReceipt {
  const r = asRecord(raw);
  const cost = asRecord(r.costSummary);
  const items = Array.isArray(r.items) ? r.items : [];

  const lines: DetailLine[] = [];
  for (const item of items) {
    const purchased = asRecord(asRecord(item).purchasedData);
    const upc = typeof purchased.upc === 'string' ? purchased.upc : null;
    if (!upc) continue;

    const display = asRecord(purchased.displayInfo);
    const pricing = asRecord(purchased.pricingInfo);
    const qty = asRecord(purchased.quantityInfo);

    const received = typeof qty.received === 'number' ? qty.received : 1;
    const refunded = typeof qty.qtyRefunded === 'number' ? qty.qtyRefunded : 0;

    lines.push({
      upc,
      description: typeof display.description === 'string' ? display.description : null,
      size: typeof display.customerFacingSize === 'string' ? display.customerFacingSize : null,
      quantity: Math.max(0, received - refunded),
      unitPricePaid: money(pricing.unitPricePaid),
      totalPricePaid: money(pricing.totalPricePaid),
      savings: money(pricing.totalSavings),
      isWeighted: purchased.isWeighted === true,
    });
  }

  const created = asRecord(r.receiptCreateDateTime);

  return {
    receiptKey,
    purchaseType: typeof r.purchaseType === 'string' ? r.purchaseType : null,
    purchasedAt:
      typeof created.value === 'string'
        ? created.value
        : typeof r.value === 'string'
          ? r.value
          : null,
    itemCount: typeof r.numberOfItems === 'number' ? r.numberOfItems : lines.length,
    lines,
    subTotal: money(cost.subTotal),
    total: money(cost.total),
    savings: money(cost.savings),
    tax: money(cost.totalTax),
    feePaid: money(cost.feePaid),
  };
}

export function parseCapture(capture: DetailsCapture): DetailReceipt[] {
  const details = capture.details ?? {};
  return Object.entries(details).map(([key, value]) => parseReceipt(key, value));
}

export interface UpcDetailStat {
  upc: string;
  description: string | null;
  size: string | null;
  /** Mean units per basket that contained the item. */
  avgQuantity: number;
  /** Most recent unit price paid. */
  lastUnitPrice: number | null;
  /** Mean unit price across captured receipts. */
  avgUnitPrice: number | null;
  totalSpend: number;
  receipts: number;
}

/** Per-UPC view across every captured receipt: name, size, typical quantity, price. */
export function detailStats(receipts: DetailReceipt[]): UpcDetailStat[] {
  const byUpc = new Map<string, { lines: DetailLine[]; dates: (string | null)[] }>();

  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      const entry = byUpc.get(line.upc) ?? { lines: [], dates: [] };
      entry.lines.push(line);
      entry.dates.push(receipt.purchasedAt);
      byUpc.set(line.upc, entry);
    }
  }

  const stats: UpcDetailStat[] = [];
  for (const [upc, { lines, dates }] of byUpc) {
    const prices = lines.map((l) => l.unitPricePaid).filter((p): p is number => p != null);
    const newestIndex = dates.reduce(
      (best, date, i) => (date && (!dates[best] || date > dates[best]!) ? i : best),
      0
    );

    stats.push({
      upc,
      description: lines.find((l) => l.description)?.description ?? null,
      size: lines.find((l) => l.size)?.size ?? null,
      avgQuantity: lines.reduce((sum, l) => sum + l.quantity, 0) / lines.length,
      lastUnitPrice: lines[newestIndex]?.unitPricePaid ?? null,
      avgUnitPrice: prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null,
      totalSpend: lines.reduce((sum, l) => sum + (l.totalPricePaid ?? 0), 0),
      receipts: lines.length,
    });
  }

  stats.sort((a, b) => b.receipts - a.receipts || a.upc.localeCompare(b.upc));
  return stats;
}
