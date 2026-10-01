import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { searchPatients } from "@/server/services/patient-service";
import { PageHeader, EmptyState } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Table, Td, Pagination } from "@/components/ui/table";
import { PatientCreateForm } from "@/components/patients/patient-create-form";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { localeFor } from "@/lib/i18n/status";

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireUser();
  const lang = await getLang();
  const params = await searchParams;
  const q = params.q ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const result = await searchPatients(user, q, page, 20);

  return (
    <>
      <PageHeader title={t("patients.title", lang)} subtitle={t("patients.listSub", lang).replace("{n}", String(result.total))} actions={<PatientCreateForm />} />
      <div className="mb-4">
        <form className="max-w-lg" action="">
          <Input name="q" defaultValue={q} placeholder={t("patients.searchPh", lang)} className="h-11" />
        </form>
      </div>

      {result.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-200 shadow-sm">
          <EmptyState
            title={q ? t("patients.noResults", lang) : t("patients.noCustomers", lang)}
            description={q ? t("patients.noResultsDesc", lang) : t("patients.firstCustomerDesc", lang)}
            action={q ? <Link href="/patients"><button className="text-primary-700 text-sm font-medium hover:underline">{t("patients.clearSearch", lang)}</button></Link> : undefined}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-200 shadow-sm overflow-hidden">
          <Table headers={["#", t("patients.fullName", lang), t("patients.phone", lang), t("patients.totals", lang), t("visits.lastVisit", lang), ""]}>
            {result.items.map((c) => (
              <tr key={c.id} className="hover:bg-ink-50/60">
                <Td className="text-ink-500 tabular-nums">{c.customerNo}</Td>
                <Td className="font-medium">{c.fullName}</Td>
                <Td className="text-right"><span dir="ltr">{c.phone}</span></Td>
                <Td>{c.visitCount}</Td>
                <Td className="text-ink-500">{c.lastVisit ? c.lastVisit.toLocaleDateString(localeFor(lang)) : "—"}</Td>
                <Td>
                  <Link href={`/patients/${c.id}`} className="text-primary-700 text-sm font-medium hover:underline">
                    {t("patients.openFile", lang)} ←
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pages={result.pages} buildHref={(p) => `/patients?q=${encodeURIComponent(q)}&page=${p}`} />
        </div>
      )}
    </>
  );
}