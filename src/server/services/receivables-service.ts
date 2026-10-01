import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { mustFind } from "@/lib/errors";
import { moneyZero } from "@/lib/money";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Patient receivables (V2).
 *
 * Outstanding per invoice follows the confirmed formula:
 *   invOutstanding = invoiceFinalAmount − Σ validPayments(COMPLETED) + refundAdjustments
 *
 * In this data model refund adjustments are realized by VOIDING payments:
 * a voided payment stops counting as a valid payment, so its amount is
 * automatically added back into the outstanding — the formula above holds
 * without a separate refund ledger.
 */

export interface StatementEntry {
  date: Date;
  kind: "INVOICE" | "PAYMENT" | "PAYMENT_VOID" | "ADJUSTMENT";
  description: string;
  invoiceNo: number | null;
  amount: number; // absolute value of the money moved
  balance: number; // running outstanding after this entry
}

async function invoicesOfCustomer(customerId: string) {
  return db.invoice.findMany({
    where: { customerId, status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
    include: { payments: { orderBy: { paidAt: "asc" } } },
  });
}

const maxZero = (v: Prisma.Decimal) => (v.gt(0) ? v : moneyZero());

/** Outstanding per invoice: finalAmount − valid payments (voids adjust automatically). */
export function outstandingOf(invoice: { finalAmount: Prisma.Decimal; payments: { amount: Prisma.Decimal; status: string }[] }): Prisma.Decimal {
  const valid = invoice.payments.filter((p) => p.status === "COMPLETED").reduce((a, p) => a.plus(p.amount), moneyZero());
  return maxZero(invoice.finalAmount.sub(valid));
}

export async function getCustomerStatement(actor: AuthUser, customerId: string) {
  const customerRow = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, customerNo: true, fullName: true, phone: true },
  });
  const customer = mustFind(customerRow, "المريض غير موجود");

  const invoices = await invoicesOfCustomer(customerId);
  const entries: StatementEntry[] = [];
  let balance = moneyZero();

  for (const inv of invoices) {
    const payments = inv.payments.filter((p) => p.status === "COMPLETED");
    const voidedPayments = inv.payments.filter((p) => p.status === "VOID");
    const events: { at: Date; kind: StatementEntry["kind"]; amount: number; description: string }[] = [
      { at: inv.createdAt, kind: "INVOICE", amount: inv.finalAmount.toNumber(), description: `فاتورة ${inv.invoiceNo}` },
      ...payments.map((p) => ({ at: p.paidAt, kind: "PAYMENT" as const, amount: p.amount.toNumber(), description: `دفعة ${p.method}` })),
      // a voided payment is shown chronologically: the original payment at paidAt,
      // then its reversal at voidedAt (the running balance must end at outstandingOf)
      ...voidedPayments.flatMap((p) => [
        { at: p.paidAt, kind: "PAYMENT" as const, amount: p.amount.toNumber(), description: `دفعة ${p.method}` },
        { at: p.voidedAt ?? p.paidAt, kind: "PAYMENT_VOID" as const, amount: p.amount.toNumber(), description: `إلغاء دفعة ${p.method}` },
      ]),
    ];
    events.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const e of events) {
      if (e.kind === "INVOICE") balance = balance.plus(e.amount);
      else if (e.kind === "PAYMENT") balance = balance.sub(e.amount);
      else balance = balance.plus(e.amount);
      entries.push({ date: e.at, kind: e.kind, description: e.description, invoiceNo: inv.invoiceNo, amount: e.amount, balance: balance.toNumber() });
    }
  }

  const invoiceTotals = invoices.reduce((acc, inv) => {
    acc.total += inv.finalAmount.toNumber();
    acc.paid += inv.payments.filter((p) => p.status === "COMPLETED").reduce((a, p) => a + p.amount.toNumber(), 0);
    return acc;
  }, { total: 0, paid: 0 });

  return {
    customer,
    outstanding: balance.toNumber(),
    summary: {
      invoicesCount: invoices.length,
      totalBilled: invoiceTotals.total,
      totalPaid: invoiceTotals.paid,
    },
    entries,
  };
}

export async function listReceivables(
  actor: AuthUser,
  opts: { query?: string | null; page?: number; pageSize?: number },
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;

  const customers = await db.customer.findMany({
    where: {
      ...(opts.query?.trim()
        ? { OR: [{ fullName: { contains: opts.query.trim(), mode: "insensitive" } }, { phone: { contains: opts.query.trim().replace(/^\+?0+/, "") } }] }
        : {}),
    },
    include: {
      invoices: {
        where: { status: { not: "VOID" } },
        include: { payments: { where: { status: "COMPLETED" } } },
      },
    },
    orderBy: { customerNo: "asc" },
  });

  const rows = customers
    .map((c) => {
      const outstanding = c.invoices.reduce((acc, inv) => {
        const valid = inv.payments.reduce((a, p) => a.plus(p.amount), moneyZero());
        return acc.plus(maxZero(inv.finalAmount.sub(valid)));
      }, moneyZero());
      return {
        customerId: c.id,
        customerNo: c.customerNo,
        fullName: c.fullName,
        phone: c.phone,
        outstanding: outstanding.toNumber(),
        openInvoices: c.invoices.filter((inv) => {
          const valid = inv.payments.reduce((a, p) => a.plus(p.amount), moneyZero());
          return inv.finalAmount.sub(valid).gt(0);
        }).length,
      };
    })
    .filter((r) => r.outstanding > 0);

  const totalOutstanding = rows.reduce((a, r) => a + r.outstanding, 0);
  const total = rows.length;
  const items = rows.slice((page - 1) * pageSize, page * pageSize);

  return {
    items,
    total,
    totalOutstanding,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function receivablesDashboard(_actor: AuthUser) {
  const customers = await db.customer.findMany({
    include: {
      invoices: {
        where: { status: { not: "VOID" } },
        include: { payments: { where: { status: "COMPLETED" } } },
      },
    },
  });
  let total = moneyZero();
  let debtors = 0;
  let partial = 0;
  let unpaid = 0;
  for (const c of customers) {
    let customerOwes = false;
    for (const inv of c.invoices) {
      const valid = inv.payments.reduce((a, p) => a.plus(p.amount), moneyZero());
      const o = inv.finalAmount.sub(valid);
      if (o.gt(0)) {
        total = total.add(o);
        customerOwes = true;
        if (valid.gt(0)) partial++;
        else unpaid++;
      }
    }
    if (customerOwes) debtors++;
  }
  return {
    totalOutstanding: total.toNumber(),
    debtors,
    invoicesPartial: partial,
    invoicesUnpaid: unpaid,
  };
}