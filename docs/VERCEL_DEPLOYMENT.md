# Vercel Deployment Guide

هذا المشروع يستخدم مشروع Vercel الموجود مسبقًا `loreen-medical-clinic` ضمن نطاق `mahmoud-sawaftahs-projects`.

## الربط المحلي

من جذر المشروع:

```powershell
npx vercel@latest link --yes --project loreen-medical-clinic --scope mahmoud-sawaftahs-projects
```

لا تُرفع ملفات `.env` أو `.env.local` إلى Git. ملف `.env.local` الذي ينشئه Vercel محلي فقط ويحتوي بيانات اعتماد خاصة بالأداة.

## إعداد Preview

أضف المتغيرات التالية إلى بيئة **Preview** في مشروع Vercel:

```text
DATABASE_URL
SESSION_SECRET
NEXT_PUBLIC_APP_URL
```

`DATABASE_URL` يجب أن يشير إلى قاعدة PostgreSQL منفصلة للـ Preview. لا تستخدم قاعدة Production، ولا تستخدم قاعدة مشروع آخر، ولا تنفذ `prisma migrate reset` أو `prisma db push` على Vercel.

بعد التأكد من أن `DATABASE_URL` يشير إلى قاعدة Preview المصرح بها:

```powershell
npx prisma migrate deploy
npx vercel@latest deploy
```

الأمر الأخير ينشئ Preview. لا تستخدم `--prod` أثناء التحقق.

## فحص Preview

بعد ظهور رابط النشر الفعلي:

1. افتح `/login` وتحقق من تسجيل الدخول.
2. تحقق من `/dashboard` والصفحات الرئيسية.
3. تحقق من القراءة والكتابة الأساسية على بيانات Preview فقط.
4. راجع Runtime Logs في Vercel بحثًا عن أخطاء قاعدة البيانات أو الجلسات.
5. تحقق من أن تحميل الملفات يستخدم التخزين المصرح به قبل تفعيل أي تخزين خارجي مدفوع.

## Rollback

في حال فشل Preview، استخدم Deployment سابقًا من لوحة Vercel أو أعد النشر من commit معروف. لا تحذف قاعدة البيانات ولا تستخدم أوامر إعادة ضبط مدمرة.
