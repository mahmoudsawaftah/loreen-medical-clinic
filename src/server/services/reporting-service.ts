import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { money, moneyZero } from "@/lib/money";
import { dailySalaryShare } from "@/lib/settings";
import { todayRange, thisMonthRange, toDateKey } from "@/lib/time";
import { receivablesDashboard } from "./receivables-service";
import { assertPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Accounting/metrics core. Money is Decimal throughout.
 * Definitions (blueprint §17.1):
 * - Revenue      = sum of non-void invoice finalAmount (invoices in period)
 * - Collected    = sum of COMPLETED payments (paidAt in period)
 * - Outstanding  = billed - collected (only surfaced when settings enable debts)
 * - MaterialCost = consumption cost snapshots (TREATMENT_USAGE movements in period)
 * - Expenses     = APPROVED expense amounts (date in period)
 * - Payroll      = configured daily allocation for the period
 * - Gross = revenue - material cost; Net = gross - expenses - payroll
 * - Cash flow    = cash in (collected) vs cash out (purchases + expenses, by method)
 */

export interface FinRange {
  start: Date;
  end: Date;
}

export async function financialMetrics(actor: AuthUser, range: FinRange): Promise<{
  revenue: number;
  collected: number;
  collectedByMethod: Record<string, number>;
  materialCost: number;
  expenses: number;
  expensesByCategory: { id: string; name: string; amount: number }[];
  payrollDaily: number;
  payrollMonthly: number;
  purchases: number;
  outstanding: number;
  grossProfit: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  cashFlow: number;
  newPatients: number;
  returningPatients: number;
  visitCount: number;
  invoicesCount: number;
  invoicesPaid: number;
  discountsTotal: number;
}> {
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD);
  const settings = await getSettings();
  const [invoices, payments, materialMovements, expenses, purchases, discounts] = await Promise.all([
    db.invoice.findMany({
      where: { createdAt: { gte: range.start, lte: range.end }, status: { not: "VOID" } },
      select: { finalAmount: true, discountAmount: true },
    }),
    db.payment.findMany({
      where: { paidAt: { gte: range.start, lte: range.end }, status: "COMPLETED" },
      select: { method: true, amount: true },
    }),
    db.stockMovement.findMany({
      where: { type: "TREATMENT_USAGE", createdAt: { gte: range.start, lte: range.end }, referenceType: "TREATMENT" },
      select: { qty: true, batchId: true, productId: true },
    }),
    db.expense.findMany({
      where: { date: { gte: range.start, lte: range.end }, status: "APPROVED" },
      select: { amount: true, categoryId: true, method: true, category: { select: { name: true } } },
    }),
    db.purchase.findMany({
      where: { date: { gte: range.start, lte: range.end }, status: "COMPLETED" },
      select: { totalAmount: true, method: true },
    }),
    db.discount.findMany({
      where: { approvedAt: { gte: range.start, lte: range.end } },
      select: { discountAmount: true },
    }),
  ]);

  const revenue = invoices.reduce((a, i) => a.plus(i.finalAmount), moneyZero());
  const collectedByMethod: Record<string, number> = { CASH: 0, CLIQ: 0, VISA: 0 };
  for (const p of payments) collectedByMethod[p.method] = (collectedByMethod[p.method] ?? 0) + p.amount.toNumber();
  const collected = payments.reduce((a, p) => a.plus(p.amount), moneyZero());
  const outstanding = revenue.sub(collected);

  // material cost: qty * snapshot cost (resolve batch costs via product movement join)
  const batchCosts = new Map<string, Prisma.Decimal>();
  const productCosts = new Map<string, Prisma.Decimal>();
  const batchIds = new Set(materialMovements.filter((m) => m.batchId).map((m) => m.batchId!));
  if (batchIds.size > 0) {
    const batches = await db.productBatch.findMany({ where: { id: { in: [...batchIds] } }, select: { id: true, unitCost: true } });
    for (const b of batches) batchCosts.set(b.id, b.unitCost ?? moneyZero());
  }
  const productIds = new Set(materialMovements.map((m) => m.productId));
  if (productIds.size > 0) {
    const products = await db.product.findMany({ where: { id: { in: [...productIds] } }, select: { id: true, avgCost: true } });
    for (const p of products) productCosts.set(p.id, p.avgCost ?? moneyZero());
  }
  let materialCost = moneyZero();
  for (const m of materialMovements) {
    const cost = m.batchId ? (batchCosts.get(m.batchId) ?? productCosts.get(m.productId) ?? moneyZero()) : (productCosts.get(m.productId) ?? moneyZero());
    materialCost = materialCost.plus(m.qty.abs().mul(cost));
  }

  const expensesByCategoryMap = new Map<string, { id: string; name: string; amount: Prisma.Decimal }>();
  for (const e of expenses) {
    const cur = expensesByCategoryMap.get(e.categoryId) ?? { id: e.categoryId, name: e.category.name, amount: moneyZero() };
    cur.amount = cur.amount.plus(e.amount);
    expensesByCategoryMap.set(e.categoryId, cur);
  }
  const expensesByCategory = [...expensesByCategoryMap.values()].map((c) => ({ id: c.id, name: c.name, amount: c.amount.toNumber() }));
  const expensesTotal = expenses.reduce((a, e) => a.plus(e.amount), moneyZero());
  const purchasesTotal = purchases.reduce((a, p) => a.plus(p.totalAmount), moneyZero());

  // payroll daily allocation for the range (based on period containing range.start)
  const startParts = { y: range.start.getUTCFullYear(), m: range.start.getUTCMonth() + 1 };
  const period = await db.payrollPeriod.findUnique({
    where: { month_year: { month: startParts.m, year: startParts.y } },
    include: { items: true },
  });
  const monthlySalary = period ? period.items.reduce((a, i) => a.plus(i.finalSalary), moneyZero()).toNumber() : 0;
  const dailyShare = dailySalaryShare(monthlySalary, startParts.y, startParts.m, settings.salaryAllocationMode);

  // days in range for payroll allocation
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysInRange = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / msPerDay));
  const payrollAlloc = dailyShare * daysInRange;

  const grossProfit = revenue.sub(materialCost);
  const netProfit = grossProfit.sub(expensesTotal).sub(money(payrollAlloc));

  const cashIn = collected.toNumber();
  const cashOutP = purchases.filter((p) => p.method === "CASH").reduce((a, p) => a.plus(p.totalAmount), moneyZero());
  const cashOutE = expenses.filter((e) => e.method === "CASH").reduce((a, e) => a.plus(e.amount), moneyZero());
  const cashOut = cashOutP.plus(cashOutE).toNumber();

  // new vs returning patients in range (first visit within range => new)
  const visitedCustomers = await db.visit.findMany({
    where: { createdAt: { gte: range.start, lte: range.end }, status: { notIn: ["CANCELLED"] } },
    select: { customerId: true },
  });
  const customerIds = [...new Set(visitedCustomers.map((v) => v.customerId))];
  let newPatients = 0;
  let returningPatients = 0;
  for (const cid of customerIds) {
    const first = await db.visit.findFirst({ where: { customerId: cid }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    if (first && first.createdAt >= range.start) newPatients++;
    else returningPatients++;
  }

  const visitCount = visitedCustomers.length;
  const invoiceCount = invoices.length;
  const invoicesPaid = await db.invoice.count({
    where: { createdAt: { gte: range.start, lte: range.end }, status: "PAID" },
  });
  const discountsTotal = discounts.reduce((a, d) => a.plus(d.discountAmount), moneyZero()).toNumber();

  return {
    revenue: revenue.toNumber(),
    collected: collected.toNumber(),
    collectedByMethod,
    materialCost: materialCost.toNumber(),
    expenses: expensesTotal.toNumber(),
    expensesByCategory,
    payrollDaily: dailyShare,
    payrollMonthly: monthlySalary,
    purchases: purchasesTotal.toNumber(),
    outstanding: outstanding.toNumber(),
    grossProfit: grossProfit.toNumber(),
    netProfit: netProfit.toNumber(),
    cashIn,
    cashOut,
    cashFlow: cashIn - cashOut,
    newPatients,
    returningPatients,
    visitCount,
    invoicesCount: invoiceCount,
    invoicesPaid,
    discountsTotal,
  };
}

export interface ReportRow {
  [key: string]: string | number;
}

export async function revenueReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const invoices = await db.invoice.findMany({
    where: { createdAt: { gte: range.start, lte: range.end }, status: { not: "VOID" } },
    include: { customer: { select: { fullName: true } }, visit: { include: { doctor: { select: { name: true } } } }, payments: { select: { amount: true, method: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  return invoices.map((i) => ({
    "رقم الفاتورة": i.invoiceNo,
    "العميلة": i.customer.fullName,
    "الدكتور": i.visit.doctor?.name ?? "",
    "السعر الأصلي": i.originalAmount.toNumber(),
    "الخصم": i.discountAmount.toNumber(),
    "النهائي": i.finalAmount.toNumber(),
    "المحصل": i.payments.filter((p) => p.status === "COMPLETED").reduce((a, p) => a.plus(p.amount), moneyZero()).toNumber(),
    "الحالة": i.status,
  }));
}

export async function collectionsByMethodReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const payments = await db.payment.findMany({
    where: { paidAt: { gte: range.start, lte: range.end }, status: "COMPLETED" },
    include: { invoice: { include: { customer: { select: { fullName: true } } } }, collectedBy: { select: { name: true } } },
    orderBy: { paidAt: "asc" },
  });
  return payments.map((p) => ({
    "التاريخ": p.paidAt.toISOString().slice(0, 10),
    "العميلة": p.invoice.customer.fullName,
    "الطريقة": p.method,
    "المبلغ": p.amount.toNumber(),
    "المرجع": p.reference ?? "",
    "المحصل": p.collectedBy.name,
  }));
}

export async function expensesReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const rows = await db.expense.findMany({
    where: { date: { gte: range.start, lte: range.end } },
    include: { category: true, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  return rows.map((e) => ({
    "التاريخ": e.date.toISOString().slice(0, 10),
    "التصنيف": e.category.name,
    "الوصف": e.description,
    "القيمة": e.amount.toNumber(),
    "الطريقة": e.method ?? "",
    "الحالة": e.status,
    "أدخلها": e.createdBy.name,
    "اعتمدها": e.approvedBy?.name ?? "",
  }));
}

export async function purchasesReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const rows = await db.purchase.findMany({
    where: { date: { gte: range.start, lte: range.end } },
    include: { supplier: { select: { name: true } }, items: true },
    orderBy: { date: "asc" },
  });
  return rows.map((p) => ({
    "رقم المشتريات": p.purchaseNo,
    "المورد": p.supplier?.name ?? "",
    "رقم فاتورة المورد": p.invoiceNo,
    "التاريخ": p.date.toISOString().slice(0, 10),
    "القيمة": p.totalAmount.toNumber(),
    "الطريقة": p.method ?? "",
    "الحالة": p.status,
    "عدد البنود": p.items.length,
  }));
}

export async function inventoryUsageReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const movements = await db.stockMovement.findMany({
    where: { type: "TREATMENT_USAGE", createdAt: { gte: range.start, lte: range.end } },
    include: { product: { select: { name: true, stockUnit: true, avgCost: true } }, batch: { select: { unitCost: true, batchNo: true } } },
    orderBy: { createdAt: "asc" },
  });
  const agg = new Map<string, { name: string; unit: string; qty: Prisma.Decimal; cost: Prisma.Decimal }>();
  for (const m of movements) {
    const cur = agg.get(m.productId) ?? { name: m.product.name, unit: m.unit, qty: moneyZero(), cost: moneyZero() };
    cur.qty = cur.qty.plus(m.qty.abs());
    cur.cost = cur.cost.plus(m.qty.abs().mul(m.batch?.unitCost ?? m.product.avgCost ?? moneyZero()));
    agg.set(m.productId, cur);
  }
  return [...agg.values()].map((a) => ({ "المنتج": a.name, "الكمية المستهلكة": a.qty.toNumber(), "الوحدة": a.unit, "تكلفة الاستهلاك": a.cost.toNumber() }));
}

export async function servicesReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const items = await db.treatmentItem.findMany({
    where: { kind: "SERVICE", treatment: { createdAt: { gte: range.start, lte: range.end } } },
    include: { treatment: { include: { visit: { include: { doctor: { select: { name: true } } } } } }, service: { select: { name: true } } },
  });
  const agg = new Map<string, { name: string; count: number; revenue: Prisma.Decimal }>();
  for (const it of items) {
    const name = it.service?.name ?? it.description;
    const price = it.treatment.visit.status !== "CANCELLED" ? it.treatment.finalPrice : moneyZero();
    const cur = agg.get(name) ?? { name, count: 0, revenue: moneyZero() };
    cur.count += 1;
    cur.revenue = cur.revenue.plus(price);
    agg.set(name, cur);
  }
  return [...agg.values()].map((a) => ({ "الخدمة": a.name, "عدد المرات": a.count, "القيمة الإجمالية": a.revenue.toNumber() }));
}

export async function doctorActivityReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const rows = await db.visit.findMany({
    where: { createdAt: { gte: range.start, lte: range.end }, status: { notIn: ["CANCELLED"] } },
    include: { doctor: { select: { name: true } }, invoice: { select: { finalAmount: true, status: true } } },
  });
  const agg = new Map<string, { name: string; visits: number; revenue: Prisma.Decimal; collected: Prisma.Decimal }>();
  for (const v of rows) {
    const name = v.doctor?.name ?? "غير محدد";
    const cur = agg.get(name) ?? { name, visits: 0, revenue: moneyZero(), collected: moneyZero() };
    cur.visits += 1;
    if (v.invoice && v.invoice.status !== "VOID") cur.revenue = cur.revenue.plus(v.invoice.finalAmount);
    agg.set(name, cur);
  }
  return [...agg.values()].map((a) => ({ "الدكتور": a.name, "عدد الزيارات": a.visits, "الإيراد": a.revenue.toNumber() }));
}

export async function discountsReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const rows = await db.discount.findMany({
    where: { approvedAt: { gte: range.start, lte: range.end } },
    include: { approvedBy: { select: { name: true } }, invoice: { include: { customer: { select: { fullName: true } } } } },
    orderBy: { approvedAt: "asc" },
  });
  return rows.map((d) => ({
    "التاريخ": d.approvedAt.toISOString().slice(0, 10),
    "العميلة": d.invoice?.customer.fullName ?? "بدون فاتورة",
    "السعر الأصلي": d.originalAmount.toNumber(),
    "الخصم": d.discountAmount.toNumber(),
    "النهائي": d.finalAmount.toNumber(),
    "السبب": d.reason ?? "",
    "المعتمد": d.approvedBy.name,
  }));
}

export async function patientsReport(actor: AuthUser, range: FinRange): Promise<ReportRow[]> {
  const rows = await db.customer.findMany({
    where: { createdAt: { lte: range.end } },
    include: { visits: { where: { createdAt: { lte: range.end }, status: { notIn: ["CANCELLED"] } }, select: { createdAt: true } }, invoices: { where: { status: { not: "VOID" } }, select: { finalAmount: true, createdAt: true } } },
  });
  return rows.map((c) => {
    const visitsInRange = c.visits.filter((v) => v.createdAt >= range.start).length;
    const isNew = visitsInRange > 0 && c.visits.filter((v) => v.createdAt < range.start).length === 0;
    const spent = c.invoices.filter((i) => i.createdAt >= range.start && i.createdAt <= range.end).reduce((a, i) => a.plus(i.finalAmount), moneyZero());
    void isNew;
    return {
      "رقم العميلة": c.customerNo,
      "الاسم": c.fullName,
      "الهاتف": c.phone,
      "إجمالي الزيارات": c.visits.length,
      "زيارات الفترة": visitsInRange,
      "إنفاق الفترة": spent.toNumber(),
    };
  });
}

export async function stockStatusReport(actor: AuthUser): Promise<ReportRow[]> {
  const products = await db.product.findMany({
    where: { active: true },
    include: { batches: { where: { active: true } } },
    orderBy: { name: "asc" },
  });
  return products.map((p) => ({
    "المنتج": p.name,
    "التصنيف": p.category,
    "الوحدة": p.stockUnit,
    "الرصيد": p.batches.reduce((a, b) => a.plus(b.qtyOnHand), moneyZero()).toNumber(),
    "حد إعادة الطلب": p.minStock.toNumber(),
    "متوسط التكلفة": p.avgCost?.toNumber() ?? 0,
  }));
}

export async function auditReport(actor: AuthUser, opts: { from?: string | null; to?: string | null; action?: string | null; entityType?: string | null; page?: number; pageSize?: number }) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const where: Prisma.AuditLogWhereInput = {};
  if (opts.from || opts.to) {
    where.createdAt = {
      ...(opts.from ? { gte: new Date(opts.from) } : {}),
      ...(opts.to ? { lte: new Date(opts.to + "T23:59:59.999Z") } : {}),
    };
  }
  if (opts.action) where.action = { contains: opts.action };
  if (opts.entityType) where.entityType = opts.entityType;
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true, englishName: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export { money, moneyZero };

/**
 * V2: profit formula split + control center.
 * Invoice lines carry amounts only for MATERIAL (and OTHER) lines; the service
 * component of a visit is the invoice remainder (finalAmount − material lines),
 * scaled proportionally when a discount exists, so that:
 *   serviceIncome + materialIncome + otherIncome === revenue
 *   materialProfit = materialIncome − materialCost (consumption only)
 *   serviceProfit  = serviceIncome
 *   grossProfit    = serviceProfit + materialProfit === revenue − materialCost
 */

function splitIncomes(invoices: { originalAmount: Prisma.Decimal; finalAmount: Prisma.Decimal; lines: { kind: string; amount: Prisma.Decimal }[] }[]) {
  let serviceIncome = moneyZero();
  let materialIncome = moneyZero();
  let otherIncome = moneyZero();
  for (const inv of invoices) {
    const scale = inv.originalAmount.gt(0) ? inv.finalAmount.div(inv.originalAmount) : money(1);
    let material = moneyZero();
    let other = moneyZero();
    for (const l of inv.lines) {
      const scaled = money(l.amount).mul(scale);
      if (l.kind === "MATERIAL") material = material.plus(scaled);
      else if (l.kind === "OTHER") other = other.plus(scaled);
    }
    materialIncome = materialIncome.plus(material);
    otherIncome = otherIncome.plus(other);
    serviceIncome = serviceIncome.plus(inv.finalAmount.sub(material).sub(other));
  }
  return { serviceIncome, materialIncome, otherIncome };
}

async function materialCostFor(range: FinRange): Promise<Prisma.Decimal> {
  const movements = await db.stockMovement.findMany({
    where: { type: "TREATMENT_USAGE", createdAt: { gte: range.start, lte: range.end }, referenceType: "TREATMENT" },
    select: { qty: true, batchId: true, productId: true },
  });
  const batchIds = [...new Set(movements.filter((m) => m.batchId).map((m) => m.batchId!))];
  const productIds = [...new Set(movements.map((m) => m.productId))];
  const [batches, products] = await Promise.all([
    batchIds.length > 0 ? db.productBatch.findMany({ where: { id: { in: batchIds } }, select: { id: true, unitCost: true } }) : Promise.resolve([]),
    productIds.length > 0 ? db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, avgCost: true } }) : Promise.resolve([]),
  ]);
  const batchCosts = new Map(batches.map((b) => [b.id, b.unitCost ?? moneyZero()]));
  const productCosts = new Map(products.map((p) => [p.id, p.avgCost ?? moneyZero()]));
  let total = moneyZero();
  for (const m of movements) {
    const cost = m.batchId ? (batchCosts.get(m.batchId) ?? productCosts.get(m.productId) ?? moneyZero()) : (productCosts.get(m.productId) ?? moneyZero());
    total = total.plus(m.qty.abs().mul(cost));
  }
  return total;
}

export async function profitBreakdown(actor: AuthUser, range: FinRange): Promise<{
  serviceIncome: number;
  materialIncome: number;
  otherIncome: number;
  materialCost: number;
  materialProfit: number;
  serviceProfit: number;
  grossProfit: number;
  materialMarginPct: number;
}> {
  const invoices = await db.invoice.findMany({
    where: { createdAt: { gte: range.start, lte: range.end }, status: { not: "VOID" } },
    select: { id: true, originalAmount: true, finalAmount: true, lines: { select: { kind: true, amount: true } } },
    orderBy: { createdAt: "asc" },
  });
  const { serviceIncome, materialIncome, otherIncome } = splitIncomes(invoices);
  const cost = await materialCostFor(range);
  const materialProfit = materialIncome.sub(cost);
  const grossProfit = serviceIncome.plus(materialProfit);
  return {
    serviceIncome: serviceIncome.toNumber(),
    materialIncome: materialIncome.toNumber(),
    otherIncome: otherIncome.toNumber(),
    materialCost: cost.toNumber(),
    materialProfit: materialProfit.toNumber(),
    serviceProfit: serviceIncome.toNumber(),
    grossProfit: grossProfit.toNumber(),
    materialMarginPct: materialIncome.gt(0) ? Number(materialProfit.div(materialIncome).mul(100).toFixed(1)) : 0,
  };
}

export interface ControlCenterSnapshot {
  today: {
    dateKey: string;
    visits: number;
    collectedByMethod: Record<string, number>;
    collected: number;
    closingStatus: string | null;
  };
  month: {
    revenue: number;
    collected: number;
    serviceIncome: number;
    materialIncome: number;
    materialCost: number;
    materialProfit: number;
    serviceProfit: number;
    grossProfit: number;
    expenses: number;
    payrollAlloc: number;
    netProfit: number;
    outstanding: number;
  };
  inventory: { lowStock: number; expiring: number };
  receivables: { totalOutstanding: number; debtors: number };
  approvals: { pendingExpenses: number; pendingPurchaseRequests: number };
  counts: { activeCustomers: number; visitsInMonth: number; openVisits: number; invoicesInMonth: number };
  lastClosing: { closeDate: Date | null; status: string | null; totalVariance: number | null } | null;
}

export async function controlCenter(actor: AuthUser): Promise<ControlCenterSnapshot> {
  const settings = await getSettings();
  const tz = settings.timezone;

  const now = new Date();
  const todayStart = todayRange(tz, now);
  const monthRange = thisMonthRange(tz, now);
  const month = { start: monthRange.start, end: monthRange.end };

  const [todayVisits, todayPayments, monthlyInvoices, monthlyPayments, materialCost, expenses, pendingExpenses, pendingRequests, lowStockAlerts, expiringAlerts, openVisits, closingToday, lastClosing] = await Promise.all([
    db.visit.count({ where: { createdAt: { gte: todayStart.start, lt: todayStart.end }, status: { notIn: ["CANCELLED"] } } }),
    db.payment.findMany({ where: { paidAt: { gte: todayStart.start, lt: todayStart.end }, status: "COMPLETED" }, select: { method: true, amount: true } }),
    db.invoice.findMany({ where: { createdAt: { gte: month.start, lt: month.end }, status: { not: "VOID" } }, select: { finalAmount: true, originalAmount: true, lines: { select: { kind: true, amount: true } } } }),
    db.payment.findMany({ where: { paidAt: { gte: month.start, lt: month.end }, status: "COMPLETED" }, select: { method: true, amount: true } }),
    materialCostFor(month),
    db.expense.findMany({ where: { date: { gte: month.start, lt: month.end }, status: "APPROVED" }, select: { amount: true } }),
    db.expense.count({ where: { status: "PENDING" } }),
    db.purchaseRequest.count({ where: { status: "PENDING" } }),
    db.product.findMany({ where: { active: true }, include: { batches: { where: { active: true } } } }),
    db.product.findMany({ where: { active: true }, include: { batches: { where: { active: true } } } }),
    db.visit.count({ where: { status: { notIn: ["CLOSED", "PAID", "CANCELLED"] } } }),
    db.dayClosing.findUnique({ where: { closeDate: todayStart.start } }),
    db.dayClosing.findFirst({ where: { status: { not: "OPEN" } }, orderBy: { closeDate: "desc" } }),
  ]);

  const collectedByMethod: Record<string, number> = { CASH: 0, CLIQ: 0, VISA: 0 };
  for (const p of todayPayments) collectedByMethod[p.method] = (collectedByMethod[p.method] ?? 0) + p.amount.toNumber();
  const todayCollected = todayPayments.reduce((a, p) => a.plus(p.amount), moneyZero());

  const monthlyRevenue = monthlyInvoices.reduce((a, i) => a.plus(i.finalAmount), moneyZero());
  const monthlyCollected = monthlyPayments.reduce((a, p) => a.plus(p.amount), moneyZero());
  const monthlyExpenses = expenses.reduce((a, e) => a.plus(e.amount), moneyZero());

  let serviceIncome = moneyZero();
  let materialIncome = moneyZero();
  for (const inv of monthlyInvoices) {
    const scale = inv.originalAmount.gt(0) ? inv.finalAmount.div(inv.originalAmount) : money(1);
    let material = moneyZero();
    for (const l of inv.lines) {
      const scaled = money(l.amount).mul(scale);
      if (l.kind === "MATERIAL") material = material.plus(scaled);
    }
    materialIncome = materialIncome.plus(material);
    serviceIncome = serviceIncome.plus(inv.finalAmount.sub(material));
  }
  const materialProfit = materialIncome.sub(materialCost);
  const grossProfit = serviceIncome.plus(materialProfit);

  const startParts = { y: month.start.getUTCFullYear(), m: month.start.getUTCMonth() + 1 };
  const period = await db.payrollPeriod.findUnique({
    where: { month_year: { month: startParts.m, year: startParts.y } },
    include: { items: true },
  });
  const monthlySalary = period ? period.items.reduce((a, i) => a.plus(i.finalSalary), moneyZero()).toNumber() : 0;
  const dailyShare = dailySalaryShare(monthlySalary, startParts.y, startParts.m, settings.salaryAllocationMode);
  const daysInMonth = Math.max(1, Math.round((month.end.getTime() - month.start.getTime()) / (24 * 60 * 60 * 1000)));
  const payrollAlloc = dailyShare * daysInMonth;
  const netProfit = grossProfit.sub(monthlyExpenses).sub(money(payrollAlloc));

  const lowStock = lowStockAlerts.filter((p) => p.batches.reduce((a, b) => a.plus(b.qtyOnHand), moneyZero()).lte(p.minStock)).length;
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiring = expiringAlerts.flatMap((p) => p.batches.filter((b) => b.expiryDate && b.expiryDate <= soon && b.qtyOnHand.gt(0))).length;

  const activeCustomers = await db.customer.count({ where: { status: "ACTIVE" } });
  const visitsInMonth = await db.visit.count({ where: { createdAt: { gte: month.start, lt: month.end }, status: { notIn: ["CANCELLED"] } } });
  const receivables = await receivablesDashboard(actor);

  return {
    today: {
      dateKey: toDateKey(now, tz),
      visits: todayVisits,
      collectedByMethod,
      collected: todayCollected.toNumber(),
      closingStatus: closingToday?.status ?? null,
    },
    month: {
      revenue: monthlyRevenue.toNumber(),
      collected: monthlyCollected.toNumber(),
      serviceIncome: serviceIncome.toNumber(),
      materialIncome: materialIncome.toNumber(),
      materialCost: materialCost.toNumber(),
      materialProfit: materialProfit.toNumber(),
      serviceProfit: serviceIncome.toNumber(),
      grossProfit: grossProfit.toNumber(),
      expenses: monthlyExpenses.toNumber(),
      payrollAlloc: payrollAlloc,
      netProfit: netProfit.toNumber(),
      outstanding: monthlyRevenue.sub(monthlyCollected).toNumber(),
    },
    inventory: { lowStock, expiring },
    receivables: { totalOutstanding: receivables.totalOutstanding, debtors: receivables.debtors },
    approvals: { pendingExpenses, pendingPurchaseRequests: pendingRequests },
    counts: { activeCustomers, visitsInMonth, openVisits, invoicesInMonth: monthlyInvoices.length },
    lastClosing: lastClosing ? { closeDate: lastClosing.closeDate, status: lastClosing.status, totalVariance: lastClosing.totalVariance?.toNumber() ?? null } : null,
  };
}
