import { describe, it, expect } from 'vitest';
import {
  money,
  parseReceipt,
  parseCapture,
  detailStats,
} from '../../server/services/receipt-details.service.js';

const line = (upc: string, over: Record<string, unknown> = {}) => ({
  purchasedData: {
    upc,
    displayInfo: { description: `Item ${upc}`, customerFacingSize: '12 oz' },
    pricingInfo: {
      originalUnitPrice: 'USD 2.99',
      unitPricePaid: 'USD 2.49',
      totalPricePaid: 'USD 2.49',
      totalSavings: 'USD 0.50',
    },
    isWeighted: false,
    quantityInfo: { received: 1, notReceived: 0, qtyRefunded: 0 },
    ...over,
  },
});

const receipt = {
  costSummary: { total: 'USD 340.31', subTotal: 'USD 339.89', savings: 'USD 22.34', totalTax: 'USD 17.81', feePaid: 'USD 0.00' },
  items: [line('111'), line('222', { quantityInfo: { received: 3, qtyRefunded: 1 } })],
  numberOfItems: 2,
  purchaseType: 'DELIVERY',
  receiptCreateDateTime: { value: '2026-09-12T14:01:02Z' },
};

describe('receipt details', () => {
  it('pulls the number out of a money string', () => {
    expect(money('USD 379.69')).toBe(379.69);
    expect(money('USD -0.50')).toBe(-0.5);
    expect(money(undefined)).toBeNull();
    expect(money(42)).toBeNull();
  });

  it('parses cost summary and line items', () => {
    const r = parseReceipt('k1', receipt);
    expect(r).toMatchObject({ receiptKey: 'k1', purchaseType: 'DELIVERY', total: 340.31, subTotal: 339.89, tax: 17.81 });
    expect(r.purchasedAt).toBe('2026-09-12T14:01:02Z');
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ upc: '111', description: 'Item 111', size: '12 oz', quantity: 1, unitPricePaid: 2.49, savings: 0.5 });
  });

  it('subtracts refunded units from the quantity received', () => {
    const r = parseReceipt('k1', receipt);
    expect(r.lines[1].quantity).toBe(2);
  });

  it('never reports a negative quantity', () => {
    const r = parseReceipt('k1', { items: [line('333', { quantityInfo: { received: 1, qtyRefunded: 5 } })] });
    expect(r.lines[0].quantity).toBe(0);
  });

  it('skips lines with no upc and survives missing fields', () => {
    const r = parseReceipt('k1', { items: [{ purchasedData: {} }, { catalogData: {} }, line('444', { displayInfo: {}, pricingInfo: {} })] });
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ upc: '444', description: null, size: null, unitPricePaid: null });
    expect(r.total).toBeNull();
  });

  it('parses a whole capture keyed by receiptKey', () => {
    const receipts = parseCapture({ details: { a: receipt, b: receipt } });
    expect(receipts.map((r) => r.receiptKey)).toEqual(['a', 'b']);
  });

  it('aggregates per-UPC quantity and price across receipts', () => {
    const older = { ...receipt, receiptCreateDateTime: { value: '2026-01-01T00:00:00Z' },
      items: [line('111', { pricingInfo: { unitPricePaid: 'USD 1.99', totalPricePaid: 'USD 1.99' }, quantityInfo: { received: 3 } })] };
    const stats = detailStats(parseCapture({ details: { old: older, recent: receipt } }));
    const item = stats.find((s) => s.upc === '111')!;

    expect(item.receipts).toBe(2);
    expect(item.avgQuantity).toBe(2); // 3 then 1
    expect(item.lastUnitPrice).toBe(2.49); // newest receipt wins
    expect(item.avgUnitPrice).toBeCloseTo(2.24, 2);
    expect(item.totalSpend).toBeCloseTo(4.48, 2);
  });
});
