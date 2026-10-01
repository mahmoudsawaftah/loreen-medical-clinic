import { getSettings } from "@/lib/settings";
import { Card, CardHeader, CardBody } from "@/components/ui/display";
import { SettingsForm } from "@/components/settings/settings-form";
import { getLang } from "@/lib/i18n/server";
import { uiText } from "@/lib/i18n/entities";

export default async function SettingsPage() {
  const settings = await getSettings();
  const lang = await getLang();
  const plain = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{uiText(lang, "الإعدادات", "Settings")}</h1>
      <p className="text-sm text-ink-500 mb-5">{uiText(lang, "جميع الخيارات &quot;قيد التحديد&quot; معطلة افتراضيًا — تفعيلها من هنا دون تغيير منطق النظام", "All optional features are disabled by default — enable them here without changing the core workflow")}</p>

      <Card>
        <CardHeader title={uiText(lang, "إعدادات العيادة والقوانين", "Clinic settings and policies")} />
        <CardBody>
          <SettingsForm initial={plain} />
        </CardBody>
      </Card>
    </>
  );
}
