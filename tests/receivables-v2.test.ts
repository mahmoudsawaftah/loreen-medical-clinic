import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";
import { setSetting } from "@/lib/settings";

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
  await setSetting("partialPaymentEnabled", true);
  await setSetting("splitPaymentEnabled", true);
});

describe("patient receivables (V2): invoutstanding = total − valid payments", () => {
  async function invoiceFor(basePrice = 100) {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, basePrice);
    return sendToCashier(w.doctor, visitId);
  }

  it("fully paid invoice leaves no receivable", async () => {
    const { collectPayment } = await import("@/server/services/billing-service");
    const { listReceivables, getCustomerStatement } = await import("@/server/services/receivables-service");
    const { invoiceId } = await invoiceFor(100);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 100 });
    const list = await listReceivables(w.owner, {});
    expect(list.items).toHaveLength(0);
    expect(list.totalOutstanding).toBe(0);
    const st = await getCustomerStatement(w.owner, w.customerId);
    expect(st.outstanding).toBe(0);
  });

  it("partial payment marks invoice PARTIALLY_PAID and outstanding = remainder", async () => {
    const { collectPayment, getInvoice } = await import("@/server/services/billing-service");
    const { getCustomerStatement, listReceivables } = await import("@/server/services/receivables-service");
    const { invoiceId } = await invoiceFor(100);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 40 });
    const inv = await getInvoice(w.owner, invoiceId);
    expect(inv.status).toBe("PARTIALLY_PAID");
    const st = await getCustomerStatement(w.owner, w.customerId);
    expect(st.outstanding).toBe(60);
    const list = await listReceivables(w.owner, {});
    expect(list.items[0].outstanding).toBe(60);
    expect(list.items[0].openInvoices).toBe(1);
  });

  it("statement running balance tracks invoice then payment entries", async () => {
    const { collectPayment } = await import("@/server/services/billing-service");
    const { getCustomerStatement } = await import("@/server/services/receivables-service");
    const { invoiceId } = await invoiceFor(100);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 40 });
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CLIQ, amount: 60 });
    const st = await getCustomerStatement(w.owner, w.customerId);
    expect(st.entries.map((e) => e.balance)).toEqual([100, 60, 0]);
    expect(st.entries.map((e) => e.kind)).toEqual(["INVOICE", "PAYMENT", "PAYMENT"]);
    expect(st.summary.totalBilled).toBe(100);
    expect(st.summary.totalPaid).toBe(100);
  });

  it("voiding a payment restores the outstanding (refund adjustment path)", async () => {
    const { collectPayment, voidPayment } = await import("@/server/services/billing-service");
    const { getCustomerStatement, listReceivables } = await import("@/server/services/receivables-service");
    const { invoiceId } = await invoiceFor(100);
    const { paymentId } = await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 100 });
    await voidPayment(w.owner, paymentId, "دفع مكرر بالخطأ");
    const st = await getCustomerStatement(w.owner, w.customerId);
    expect(st.outstanding).toBe(100);
    expect(st.entries.at(-1)?.kind).toBe("PAYMENT_VOID");
    expect(st.entries.at(-1)?.balance).toBe(100);
    const list = await listReceivables(w.owner, {});
    expect(list.items[0].outstanding).toBe(100);
  });

  it("dashboards aggregate debtors and outstanding totals", async () => {
    const { collectPayment } = await import("@/server/services/billing-service");
    const { receivablesDashboard } = await import("@/server/services/receivables-service");
    const { invoiceId: a } = await invoiceFor(100);
    await collectPayment(w.secretary, { invoiceId: a, method: PaymentMethod.CASH, amount: 30 });
    const { invoiceId: b } = await invoiceFor(50);
    await collectPayment(w.secretary, { invoiceId: b, method: PaymentMethod.VISA, amount: 10 });
    const dash = await receivablesDashboard(w.accountant);
    expect(dash.totalOutstanding).toBe(110);
    expect(dash.debtors).toBe(1);
    expect(dash.invoicesPartial).toBe(2);
    expect(dash.invoicesUnpaid).toBe(0);
  });

  it("mixed payment methods still require the split-payment setting", async () => {
    await setSetting("splitPaymentEnabled", false);
    const { collectPayment } = await import("@/server/services/billing-service");
    const { invoiceId } = await invoiceFor(100);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 40 });
    await expect(collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CLIQ, amount: 60 })).rejects.toThrow(AppError);
  });

  it("paying in full closes the receivable (balance 0, no debtor rows)", async () => {
    const { collectPayment } = await import("@/server/services/billing-service");
    const { getCustomerStatement, listReceivables } = await import("@/server/services/receivables-service");
    const { invoiceId } = await invoiceFor(100);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 25 });
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.VISA, amount: 75 });
    const st = await getCustomerStatement(w.owner, w.customerId);
    expect(st.outstanding).toBe(0);
    const list = await listReceivables(w.owner, {});
    expect(list.items.filter((r) => r.customerId === w.customerId)).toHaveLength(0);
  });
});