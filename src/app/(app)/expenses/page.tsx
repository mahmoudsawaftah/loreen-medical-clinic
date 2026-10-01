import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatDate } from "@/lib/time";
import { listExpenses, listExpenseCategories } from "@/server/services/expense-service";
import { Card, CardBody } from "@/components/ui/display";
import { StatusBadge } from "@/components/status";
import { ExpenseCreateModal, ExpenseCategoryModal, ApproveExpenseModal, VoidExpenseButton } from "@/components/expenses/expense-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { statusLabels } from "@/lib/i18n/status";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const expenseLabels = statusLabels("expense", lang);
  const paymentLabels = statusLabels("paymentMethod", lang);
  const canApprove = hasPermission(user, PERMISSIONS.EXPENSE_APPROVE);
  const canManage = hasPermission(user, PERMISSIONS.EXPENSE_MANAGE);
  const [categories, result] = await Promise.all([
    listExpenseCategories(user),
    listExpenses(user, { status: sp.status ?? null, pageSize: 100 }),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">{t("expenses.title", lang)}</h1>
          <p className="text-sm text-ink-500">{result.total} {t("expenses.count", lang)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex items-center gap-2">
            <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-lg border border-ink-300 px-2 text-sm bg-white">
              <option value="">{t("common.all", lang)}</option>
              <option value="PENDING">{expenseLabels.PENDING}</option>
              <option value="APPROVED">{expenseLabels.APPROVED}</option>
              <option value="REJECTED">{expenseLabels.REJECTED}</option>
              <option value="VOID">{expenseLabels.VOID}</option>
            </select>
          </form>
          <ExpenseCategoryModal />
          {canManage && <ExpenseCreateModal categories={categories} />}
        </div>
      </div>

      <Card>
        <CardBody className="p-0">
          {result.items.length === 0 ? (
            <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("expenses.noData", lang)}</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {result.items.map((e) => (
                <div key={e.id} className="px-4 sm:px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-bold tabular-nums">{formatMoney(e.amount, settings.currency, lang)}</span>
                    <span className="text-sm font-medium">{e.description}</span>
                    <span className="text-xs text-ink-500">{e.category.name}</span>
                    <span className="text-[11px] text-ink-400">{formatDate(e.date, settings.timezone)}</span>
                    {e.method && <span className="text-[11px] text-ink-400">{paymentLabels[e.method] ?? e.method}</span>}
                    <div className="mr-auto flex items-center gap-2">
                      <StatusBadge status={e.status} labels={expenseLabels} />
                      {canApprove && e.status === "PENDING" && <ApproveExpenseModal expenseId={e.id} />}
                      {canManage && e.status !== "VOID" && <VoidExpenseButton expenseId={e.id} />}
                    </div>
                  </div>
                  {e.notes && <p className="text-[11px] text-ink-500 mt-1">{e.notes}</p>}
                  {e.rejectedReason && <p className="text-[11px] text-red-500 mt-1">{t("expenses.rejectedReason", lang)}: {e.rejectedReason}</p>}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
