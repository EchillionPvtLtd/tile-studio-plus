import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { buildQuote, tileAreaSqFt, WASTAGE } from "@/lib/quotation";
import { renderQuotation, type QuotationImages, type QuotationPdfInput } from "@/lib/quotationPdf";

const noImages = (thumbs = 0): QuotationImages => ({ logo: null, tsLogo: null, echilion: null, snapshot: null, thumbs: Array(thumbs).fill(null) });

const line = (n: number) => ({
  surface: "wall-w" as const,
  label: "West wall",
  tile: { id: `t${n}`, sku: `SKU-${n}`, name: `Oak Plank ${n}`, category: "both", widthMm: 200, heightMm: 1200, finish: "Matt", color: "#fff", colorName: "x", textureUrl: "", previewUrl: "", pricePerSqFt: 300, isBuiltIn: false, createdAt: "" },
  areaSqFt: 120,
  tiles: 52,
  purchaseSqFt: 134.3,
  amount: 40290,
});

const base = (lines: ReturnType<typeof line>[]): QuotationPdfInput => ({
  quoteNo: "Q20261018-000001",
  date: new Date("2026-10-18"),
  validDays: 14,
  shop: null,
  customer: { name: "", phone: "" },
  room: { label: "Living Room", presetName: null, lengthFt: 22, widthFt: 16, heightFt: 11 },
  quote: { lines, total: lines.reduce((s, l) => s + l.amount, 0) },
  finishes: [],
  snapshot: null,
});

// jsPDF writes page text uncompressed, so the content stream can be searched
const textOf = (input: QuotationPdfInput, imgs: QuotationImages) => renderQuotation(jsPDF, input, imgs).output();

describe("quotation PDF layout", () => {
  it("never presents LKR 0 as a price when no tile is chosen", () => {
    const out = textOf(base([]), noImages());
    expect(out).toContain("No tile products selected for this quotation yet.");
    expect(out).toContain("Not yet available");
    expect(out).not.toContain("LKR 0");
  });

  it("shows the transparent waste breakdown and the total for a tiled room", () => {
    const out = textOf(base([line(1)]), noImages(1));
    expect(out).toContain("QUANTITY & WASTE CALCULATION");
    expect(out).toContain("LKR 40,290");
  });

  it("continues a long table on further pages and numbers every page", () => {
    const lines = Array.from({ length: 40 }, (_, i) => line(i));
    const doc = renderQuotation(jsPDF, base(lines), noImages(40));
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(2);
    expect(doc.output()).toContain(`Page ${pages} of ${pages}`);
  });

  it("prints the Echilion contact details on the last page", () => {
    const out = textOf(base([line(1)]), noImages(1));
    expect(out).toContain("POWERED BY");
    expect(out).toContain("+94 74 155 9898");
    expect(out).toContain("info@echilion.com");
    expect(out).toContain("echilion.com");
    // The details are clickable
    expect(out).toContain("mailto:info@echilion.com");
    expect(out).toContain("https://echilion.com/");
  });

  it("uses only black, white and grey for its own drawing", () => {
    const out = textOf(base([line(1), line(2)]), noImages(2));
    // jsPDF writes a grey as one value (g / G); any coloured fill, line or text would be written as three (rg / RG)
    expect(out).toMatch(/ g\n/);
    expect(out).not.toMatch(/[\d.]+ [\d.]+ [\d.]+ (rg|RG)\n/);
  });

  it("leaves out customer details nobody entered instead of printing a placeholder", () => {
    const out = textOf(base([line(1)]), noImages(1));
    expect(out).not.toContain("Customer not specified");
    expect(out).not.toContain("PREPARED FOR");
    const named = textOf({ ...base([line(1)]), customer: { name: "A. Perera", phone: "0771234567" } }, noImages(1));
    expect(named).toContain("PREPARED FOR");
    expect(named).toContain("A. Perera");
  });

  it("starts the tile table on page 2 when page 1 carries the room picture", () => {
    const pic = { data: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=", w: 1600, h: 1000, format: "JPEG" as const };
    const doc = renderQuotation(jsPDF, base([line(1)]), { ...noImages(1), snapshot: pic });
    expect(doc.getNumberOfPages()).toBe(2);
    expect(doc.output()).toContain("3D ROOM VISUALIZATION");
  });
});

describe("quotation quantities", () => {
  const tile = { id: "t", sku: "S", name: "Test", category: "both", widthMm: 600, heightMm: 600, finish: "Matt", color: "#fff", colorName: "x", textureUrl: "", previewUrl: "", pricePerSqFt: 250, isBuiltIn: false, createdAt: "" };
  const room = {
    roomType: "living-room" as const, lengthFt: 22, widthFt: 16, heightFt: 11,
    doorWidthFt: 3, doorHeightFt: 7, windowWidthFt: 4, windowHeightFt: 4, featureWallTreatment: "none",
    getTileForSurface: (s: string) => (s === "floor" || s === "wall-s" ? tile : null),
  };

  it("buys whole tiles that cover the net area plus the waste allowance, and prices the area bought", () => {
    const q = buildQuote(room as Parameters<typeof buildQuote>[0]);
    expect(q.lines.length).toBe(2);
    const per = tileAreaSqFt(tile);
    for (const l of q.lines) {
      expect(l.tiles).toBe(Math.ceil((l.areaSqFt / per) * (1 + WASTAGE)));
      expect(l.tiles * per).toBeGreaterThanOrEqual(l.areaSqFt * (1 + WASTAGE) - 1e-9);
      expect(l.purchaseSqFt).toBeCloseTo(l.tiles * per, 1);
      expect(l.amount).toBe(Math.round(l.purchaseSqFt * tile.pricePerSqFt));
    }
    expect(q.total).toBe(q.lines.reduce((s, l) => s + l.amount, 0));
  });
});
