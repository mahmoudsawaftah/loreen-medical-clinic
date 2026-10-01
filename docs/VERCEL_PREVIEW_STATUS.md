# Vercel Preview Status

## الحالة الحالية

- GitHub: https://github.com/mahmoudsawaftah/loreen-medical-clinic
- Vercel project: `loreen-medical-clinic`
- Vercel scope: `mahmoud-sawaftahs-projects`
- فرع العمل: `fix/vercel-preview`
- المشروع مربوط بمشروع Vercel الحالي، ولم يتم إنشاء مشروع مكرر.
- لم يتم تنفيذ نشر Production.

## ما تم إصلاحه

- تصحيح `.gitignore` حتى يتم تتبع `src/lib/storage/`، مع إبقاء مجلد التخزين المحلي الجذري `/storage/` مستثنى.
- الاحتفاظ بتطبيق التخزين الحقيقي وواجهته الحالية: `getStorage` و`save` و`read` و`delete`.
- إزالة إشعار السكرتارية غير الصحيح عند إنشاء زيارة بدون طبيب.
- تحديث اختبار تسمية مركز العمل وإزالة مفتاح ترجمة غير مستخدم.

## التحقق المحلي

- `npm test`: نجح 205 من 205 اختبارًا.
- `npm run typecheck`: نجح.
- `npm run lint`: نجح بدون أخطاء، مع 17 تحذيرًا قائمًا عن متغيرات غير مستخدمة.
- `npm run build`: نجح وتم توليد 34 صفحة.

## العائق قبل Preview

بيئة Vercel Preview الحالية لا تحتوي متغيرات بيئة. يلزم إعداد قاعدة PostgreSQL منفصلة ومصرح بها للـ Preview، ولا يجوز استخدام قاعدة Production أو قاعدة مشروع آخر.

أسماء المتغيرات المطلوبة تُضاف من إعدادات Vercel دون وضع قيمها في Git:

- `DATABASE_URL`: رابط قاعدة PostgreSQL منفصلة للـ Preview.
- `SESSION_SECRET`: قيمة عشوائية قوية خاصة بالـ Preview.
- `NEXT_PUBLIC_APP_URL`: رابط Preview الفعلي بعد إنشائه.

بعد إضافة القيم من Vercel، يجب تشغيل `prisma migrate deploy` على قاعدة Preview فقط، ثم اختبار تسجيل الدخول والصفحات والقراءة والكتابة والسجلات runtime.

## قرار النشر

لا يتم تنفيذ Preview فعلي أو ترحيل قاعدة البيانات قبل توفير قاعدة Preview منفصلة ومتغيرات البيئة من خلال Vercel. هذا يمنع تسريب الأسرار أو تعديل بيانات حقيقية بالخطأ.
