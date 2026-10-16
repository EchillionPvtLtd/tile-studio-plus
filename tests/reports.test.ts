import { describe, expect, it } from "vitest";
import { buildReport, csvCell, invoicesToCsv, monthKeys, reportFileName, type ReportPayment } from "@/lib/reports";

const TODAY = "2026-10-15";

let n = 0;
const inv = (over: Partial<ReportPayment> & { due: string }): ReportPayment => {
  const { due, ...rest } = over;
  n++;
  return {
    id: `p${n}`,
    invoiceNo: `INV-${1000 + n}`,
    shopId: "s1",
    shopName: "Choice Ceramic",
    email: "choice@x.lk",
    plan: "Starter",
    amount: 5000,
    status: "Pending",
    dueDate: `${due}T00:00:00.000Z`,
    graceUntil: null,
    paidAt: null,
    method: null,
    reference: null,
    ...rest,
  };
};
const paid = (due: string, amount = 5000, extra: Partial<ReportPayment> = {}) =>
  inv({ due, amount, status: "Received", paidAt: `${due}T00:00:00.000Z`, method: "Bank transfer", ...extra });

describe("monthKeys", () => {
  it("ends with the current month and crosses year boundaries", () => {
    expect(monthKeys("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthKeys(TODAY, 1)).toEqual(["2026-10"]);
    expect(monthKeys(TODAY, 12)[0]).toBe("2025-11");
  });
});

describe("buildReport", () => {
  it("counts received as collected and pending/failed as still to collect; refunds are listed but not counted", () => {
    const r = buildReport(
      [paid("2026-10-01", 10000), inv({ due: "2026-10-01", amount: 5000 }), inv({ due: "2026-10-01", amount: 2000, status: "Failed" }), inv({ due: "2026-10-01", amount: 700, status: "Refunded" })],
      "month",
      TODAY,
    );
    expect(r.collected).toBe(10000);
    expect(r.owed).toBe(7000);
    expect(r.billed).toBe(17000);
    expect(r.rate).toBe(59);
    expect(r.refunded).toBe(700);
    expect(r.invoices).toHaveLength(4);
  });

  it("rate is null when nothing was billed", () => {
    const r = buildReport([], "6m", TODAY);
    expect(r.rate).toBeNull();
    expect(r.buckets).toHaveLength(6);
    expect(r.invoices).toEqual([]);
  });

  it("puts each invoice in the month it falls due, not the month it was paid", () => {
    const r = buildReport([paid("2026-08-01", 5000, { paidAt: "2026-09-20T00:00:00.000Z" })], "6m", TODAY);
    const aug = r.buckets.find((b) => b.label === "Aug '26")!;
    const sep = r.buckets.find((b) => b.label === "Sep '26")!;
    expect(aug.collected).toBe(5000);
    expect(sep.collected).toBe(0);
  });

  it("limits the period: 6 months excludes older invoices, 12 months includes them", () => {
    const old = paid("2026-01-01");
    expect(buildReport([old], "6m", TODAY).invoices).toHaveLength(0);
    expect(buildReport([old], "12m", TODAY).invoices).toHaveLength(1);
    expect(buildReport([paid("2025-09-01")], "12m", TODAY).invoices).toHaveLength(0);
    expect(buildReport([paid("2026-11-01")], "12m", TODAY).invoices).toHaveLength(0); // next month is not in the period
  });

  it("this month is split into four weeks, with days 29-31 in the last one", () => {
    const r = buildReport([paid("2026-10-01", 1), paid("2026-10-07", 2), paid("2026-10-08", 4), paid("2026-10-22", 8), paid("2026-10-31", 16)], "month", TODAY);
    expect(r.buckets.map((b) => b.label)).toEqual(["Week 1", "Week 2", "Week 3", "Week 4"]);
    expect(r.buckets.map((b) => b.collected)).toEqual([3, 4, 0, 24]);
  });

  it("flags overdue invoices and honours extra time", () => {
    const r = buildReport(
      [
        inv({ due: "2026-10-01" }),
        inv({ due: "2026-10-01", graceUntil: "2026-10-20T00:00:00.000Z" }),
        inv({ due: "2026-10-15" }),
        paid("2026-09-01"),
        inv({ due: "2026-08-01", amount: 9000 }),
      ],
      "6m",
      TODAY,
    );
    expect(r.overdue.map((p) => p.daysLate)).toEqual([75, 14]); // longest overdue first
    expect(r.overdueAmount).toBe(14000);
  });

  it("overdue ignores the chosen period", () => {
    const r = buildReport([inv({ due: "2026-03-01" })], "month", TODAY);
    expect(r.invoices).toHaveLength(0);
    expect(r.overdue).toHaveLength(1);
  });

  it("breaks revenue down by plan, showroom and payment method", () => {
    const r = buildReport(
      [
        paid("2026-10-01", 5000, { shopId: "a", shopName: "A", plan: "Starter", method: "Cash" }),
        paid("2026-10-01", 10000, { shopId: "b", shopName: "B", plan: "Professional", method: "Bank transfer" }),
        paid("2026-09-01", 10000, { shopId: "b", shopName: "B", plan: "Professional", method: null }),
        inv({ due: "2026-10-01", shopId: "a", shopName: "A", plan: "Starter", amount: 5000 }),
      ],
      "6m",
      TODAY,
    );
    expect(r.byPlan.map((p) => [p.plan, p.collected, p.owed, p.count])).toEqual([["Professional", 20000, 0, 2], ["Starter", 5000, 5000, 2]]);
    expect(r.byShop.map((s) => [s.shopName, s.collected, s.owed])).toEqual([["B", 20000, 0], ["A", 5000, 5000]]);
    expect(Object.fromEntries(r.byMethod.map((m) => [m.method, m.amount]))).toEqual({ "Bank transfer": 10000, "Not recorded": 10000, Cash: 5000 });
  });

  it("lists invoices newest due date first", () => {
    const r = buildReport([paid("2026-08-01"), paid("2026-10-01"), paid("2026-09-01")], "6m", TODAY);
    expect(r.invoices.map((p) => p.dueDate.slice(0, 10))).toEqual(["2026-10-01", "2026-09-01", "2026-08-01"]);
  });
});

describe("CSV", () => {
  it("quotes cells and doubles inner quotes", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(5000)).toBe("5000");
  });

  it("defuses spreadsheet formulas but leaves negative numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+94 77 123 4567")).toBe('"\'+94 77 123 4567"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
    expect(csvCell(-250)).toBe("-250");
  });

  it("writes a header and one row per invoice, marking overdue ones", () => {
    const csv = invoicesToCsv(buildReport([paid("2026-10-01", 5000, { shopName: 'Tiles, "R" Us' }), inv({ due: "2026-09-01" })], "6m", TODAY).invoices);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"Invoice","Showroom","Email","Plan","Status","Due date","Extra time until","Date received","Method","Reference","Amount (LKR)"');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Tiles, ""R"" Us"');
    expect(lines[1]).toContain('"Received","2026-10-01"');
    expect(lines[2]).toContain('"Pending (overdue)"');
  });

  it("names the files by period", () => {
    expect(reportFileName(buildReport([], "6m", TODAY), TODAY, "csv")).toBe("tilestudio-revenue-6-months-2026-10-15.csv");
    expect(reportFileName(buildReport([], "month", TODAY), TODAY, "pdf")).toBe("tilestudio-revenue-this-month-2026-10-15.pdf");
  });
});
