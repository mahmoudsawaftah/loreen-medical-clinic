import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { listServices } from "@/server/services/service-catalog-service";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui/display";
import { ServiceCreateModal, ServiceEditModal } from "@/components/services/service-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { localizedName } from "@/lib/i18n/entities";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const page = Math.max(1, Number(sp.page) || 1);
  const canCreate = hasPermission(user, GRANULAR_PERMISSIONS.SERVICES_CREATE);
  const canEdit = hasPermission(user, GRANULAR_PERMISSIONS.SERVICES_EDIT);
  const result = await listServices(user, { query: sp.q, page, pageSize: 24 });
  const fmt = (n: number | null | undefined) => (n == null ? "—" : `${n} ${t("services.min", lang)}`);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">{t("services.title", lang)}</h1>
          <p className="text-sm text-ink-500">{t("services.subtitle", lang).replace("{n}", String(result.total))}</p>
        </div>
        <div className="flex gap-2">
          <form method="get">
            <input name="q" defaultValue={sp.q ?? ""} placeholder={t("services.searchPh", lang)} className="h-10 rounded-lg border border-ink-300 px-3 text-sm w-56" />
          </form>
          {canCreate && <ServiceCreateModal />}
        </div>
      </div>

      {result.items.length === 0 ? (
        <EmptyState title={t("services.none", lang)} description={t("services.noneDesc", lang)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {result.items.map((s) => {
            const mats = (s.defaultMaterials as { name?: string; qty?: string | number; unit?: string | null }[] | null) ?? [];
            return (
              <Card key={s.id} className={s.active ? "" : "opacity-70"}>
                <CardBody className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink-900 truncate">{localizedName(s.name, s.englishName, lang)}</h3>
                      {((lang === "en" && s.name) || (lang === "ar" && s.englishName)) && <p className="text-xs text-ink-400 truncate" dir={lang === "en" ? "rtl" : "ltr"}>{lang === "en" ? s.name : s.englishName}</p>}
                    </div>
                    {s.active ? <Badge tone="success">{t("services.activeBadge", lang)}</Badge> : <Badge tone="neutral">{t("services.inactiveBadge", lang)}</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                    <span className="font-bold text-primary-700">{s.defaultPrice != null ? `${Number(s.defaultPrice)} ر.د` : t("services.noPrice", lang)}</span>
                    {s.durationMinutes && <span>{fmt(s.durationMinutes)}</span>}
                    {s.category && <Badge tone="info">{s.category}</Badge>}
                  </div>
                  {s.notes && <p className="mt-2 text-xs text-ink-500 line-clamp-2">{s.notes}</p>}
                  {mats.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-ink-100">
                      <p className="text-[11px] font-medium text-ink-400 mb-1">{t("services.defaultMaterials", lang)}</p>
                      <ul className="space-y-0.5 text-xs text-ink-600">
                        {mats.slice(0, 3).map((m, i) => (
                          <li key={i}>• {m.name}{m.qty ? ` — ${m.qty}${m.unit ? ` ${m.unit}` : ""}` : ""}</li>
                        ))}
                        {mats.length > 3 && <li className="text-ink-400">{t("services.more", lang).replace("{n}", String(mats.length - 3))}</li>}
                      </ul>
                    </div>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex justify-end">
                      <ServiceEditModal service={{
                        id: s.id,
                        name: s.name,
                        englishName: s.englishName,
                        category: s.category,
                        defaultPrice: s.defaultPrice != null ? Number(s.defaultPrice) : null,
                        durationMinutes: s.durationMinutes,
                        notes: s.notes,
                        materials: mats.map((m) => ({ name: m.name ?? "", qty: m.qty ?? "", unit: m.unit ?? null })),
                        active: s.active,
                      }} />
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
