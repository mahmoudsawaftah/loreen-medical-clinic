# ماذا ترسل إلى OpenCode؟

أرسل له **هذا المجلد كاملًا** أو ملف الـZIP كاملًا، ثم اكتب له فقط:

> Read `START_HERE.md` and build the entire project autonomously. Do not wait for me to send feature-by-feature prompts. Follow the blueprint and acceptance criteria, run tests, fix your own errors, and stop only for external credentials that cannot be generated locally. For any business item marked TBD, do not invent a policy; make it configurable/disabled and continue.

بعدها المفروض OpenCode يقرأ الملفات ويقسم الشغل داخليًا وينفذ المشروع.

## متى قد يحتاجك فعلًا؟
فقط عند أشياء خارج الكود لا يستطيع اختراعها، مثل:
- بيانات استضافة/قاعدة بيانات الإنتاج.
- مفاتيح مزود WhatsApp/SMS الحقيقي.
- تخزين سحابي إذا قررت استخدام مزود خارجي.
- دومين الإنتاج.
- قرار عمل حقيقي بقي TBD في الـBlueprint.

أما البرمجة العادية، قاعدة البيانات، الواجهات، الصلاحيات، الاختبارات، والـseed فلا يحتاج أن ترجع كل مرة للحصول على Prompt جديد.
