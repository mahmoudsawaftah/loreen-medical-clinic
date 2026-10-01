# LOREEN Medical Clinic

نظام إدارة عيادة تجميل متكامل — واجهة عربية بالكامل، مبني بـ Next.js 16 + Prisma + PostgreSQL.

## Quick start

```bash
npm install
# تأكد من تشغيل PostgreSQL وإعداد .env بالشكل:
#   DATABASE_URL="postgresql://clinic:clinic_dev_password@localhost:5432/clinic?schema=public"
npx prisma generate
npx prisma migrate deploy        # أو npx prisma db push
npm run db:seed                  # بيانات تجريبية + الإعدادات الافتراضية
npm run dev                      # http://localhost:3000
```

## Demo accounts (after seeding)

| الدور | اسم المستخدم | كلمة المرور |
|---|---|---|
| د. أحمد — مالك العيادة | `dr.ahmad` | `ClinicOwner@2026` |
| د. سامح — مالك بصلاحيات كاملة | `dr.sameh` | `ClinicDoc@2026` |
| د. جوليا — طبيبة | `doctor` | `ClinicDoc@2026` |
| أفنان — السكرتيرة | `secretary` | `ClinicSec@2026` |

كل الحسابات تُنشأ مع `mustChangePassword: true` — أول دخول يفرض تغيير كلمة المرور.

## Commands

| الأمر | الوصف |
|---|---|
| `npm run dev` | تشغيل التطوير |
| `npm run build` | بناء الإنتاج (22 صفحة) |
| `npm run typecheck` | فحص الأنواع (يشمل الاختبارات والـ seed) |
| `npm run lint` | فحص الكود (0 errors — بقية التحذيرات معاملات `actor` غير المستخدمة في التواقيع) |
| `npm test` | الاختبارات التكاملية (Vitest ضد قاعدة `clinic_test` — تشترط Postgres يعمل محليًا) |
| `npm run db:seed` | زرع البيانات التجريبية (idempotent — آمن لإعادة التشغيل) |

## Tests

- 7 ملفات اختبار / 35 اختبارًا تكامليًا على قاعدة حقيقية `clinic_test` (تُنشأ تلقائيًا عبر `prisma db push` في setup عام).
- تغطي: دورة حياة الزيارة كاملة، الخصومات والدفعات والإلغاءات، خصم المخزون عند الإرسال للكاشير (idempotent) وFIFO، شراء/استلام المخزون، المصروفات والاعتماد، الإغلاق اليومي وإعادة الفتح، CRM والمتابعات وسجل التواصل، كشف المرضى والملف الطبي، التقارير/الرواتب المالية، مصفوفة الصلاحيات.
- ملاحظة: `tests/setup.ts` يفرض `DATABASE_URL` لقاعدة الاختبار — لا تغيّرها.

## Backup

```powershell
.\scripts\backup.ps1        # نسخة DB (pg_dump) + مجلد المرفقات storage\
```

تسقط النسخ في `backups\` مع استبقاء آخر 14 نسخة.

## Structure

```
prisma/schema.prisma        # 30+ نموذجًا (زيارات، فوترة، مخزون، مشتريات، رواتب، CRM، تدقيق)
prisma/seed.ts              # بيانات تجريبية idempotent + الإعدادات
src/lib/                    # money (Decimal)، time (tz)، errors، settings، permissions، session، audit
src/server/services/        # منطق الأعمال — كل خدمة مستقلة عن HTTP
src/server/actions/         # Server Actions مع requireRole/requirePermission
src/app/(app)/              # الصفحات العربية (RTL)
tests/                      # الاختبارات التكاملية + infra
docs/BLUEPRINT_AR.md        # المواصفات الأصلية
IMPLEMENTATION_REPORT.md    # القرارات التقنية + جدول TBD
```

## Production notes

- المصاريف/الخصومات/الرواتب وغيرها من السياسات المعلقة (TBD) معطلة افتراضيًا وقابلة للتفعيل من الإعدادات — انظر `IMPLEMENTATION_REPORT.md`.
- كل تغيير مالي يُسجَّل في `AuditLog` (من، ماذا، قبل، بعد).
- المرفقات عبر مزود تخزين قابل للتبديل (محلي افتراضيًا) — مفاتيح مزودات WhatsApp/SMS/التخزين السحابي هي "المدخلات الخارجية" الوحيدة التي تتطلب قرارًا بشريًا.
