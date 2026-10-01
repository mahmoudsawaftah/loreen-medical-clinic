import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = {
  OWNER: "ClinicOwner@2026",
  ACCOUNTANT: "ClinicAcct@2026",
  MAIN_DOCTOR: "ClinicDoc@2026",
  DOCTOR: "ClinicDoc@2026",
  SECRETARY: "ClinicSec@2026",
} as const;

const DEFAULT_SETTINGS: Record<string, unknown> = {
  clinicName: "LOREEN BEAUTY CLINIC",
  clinicNameAr: "عيادة لورين للتجميل",
  clinicPhone: "",
  timezone: "Asia/Amman",
  currency: "JOD",
  sessionTtlMinutes: 720,
  closingMandatory: false,
  splitPaymentEnabled: true,
  partialPaymentEnabled: true,
  refundEnabled: false,
  discountReasonRequired: false,
  inventoryDeductAt: "TREATMENT_COMPLETED",
  salaryAllocationMode: "CALENDAR_DAYS",
  ownerPurchaseAutoApproved: true,
  expensesRequireApproval: true,
  accountantCanCreateExpenses: true,
  commissionsEnabled: false,
  allowNegativeStock: false,
  exportFormat: "csv",
  messagingChannel: "mock",
  beforeAfterPhotosEnabled: false,
  appointmentsEnabled: true,
  doctorsCanCreateMedicalPurchaseRequests: false,
  doctorsCanCreateOperationalPurchaseRequests: false,
  doctorsCanSeeFinancialReports: false,
  doctorsCanRecordWaste: false,
};

async function upsertUser(username: string, name: string, englishName: string, role: Role, password: string, permissionOverrides?: string[]) {
  return prisma.user.upsert({
    where: { username },
    update: { name, englishName, role, permissionOverrides: permissionOverrides ?? { set: [] } },
    create: {
      username,
      name,
      englishName,
      role,
      status: "ACTIVE",
      mustChangePassword: true,
      passwordHash: bcrypt.hashSync(password, 10),
      ...(permissionOverrides ? { permissionOverrides } : {}),
    },
  });
}

async function upsertEmployeeFor(user?: { id: string; name: string; role: string }, jobTitle?: string, englishName?: string, monthlySalary?: number) {
  if (!user) return;
  await prisma.employee.upsert({
    where: { userId: user.id },
    update: { name: user.name, englishName, jobTitle: jobTitle ?? `موظف (${user.role})`, active: true },
    create: {
      userId: user.id,
      name: user.name,
      englishName,
      jobTitle: jobTitle ?? `موظف (${user.role})`,
      monthlySalary: monthlySalary ?? 500,
      startDate: new Date(),
      active: true,
    },
  });
}

interface MinFindCreateDelegate {
  findFirst(args: { where: Record<string, unknown> }): Promise<{ id: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
}

async function firstOrCreate(model: "service" | "product" | "supplier" | "expenseCategory" | "medication", data: { name: string; [k: string]: unknown }) {
  const delegate = prisma[model] as unknown as MinFindCreateDelegate;
  const existing = await delegate.findFirst({ where: { name: data.name } });
  if (existing) {
    if ("englishName" in data) return delegate.update({ where: { id: existing.id }, data: { englishName: data.englishName } });
    return existing;
  }
  return delegate.create({ data });
}

async function main() {
  console.log("Seeding clinic…");

  const owner = await upsertUser("dr.ahmad", "د. أحمد", "Dr. Ahmad", "OWNER", DEMO_PASSWORD.OWNER);
  const accountant = await prisma.user.findUnique({ where: { username: "accountant" } });
  // د. سامح يملك صلاحيات المالك مثل د. أحمد، مع بقاء الحسابين منفصلين للتدقيق.
  const sameh = await upsertUser("dr.sameh", "د. سامح", "Dr. Sameh", "OWNER", DEMO_PASSWORD.MAIN_DOCTOR);
  // د. جوليا: طبيبة بصلاحيات سريرية فقط، بلا صلاحيات مالية إدارية.
  const doctor = await upsertUser("doctor", "د. جوليا", "Dr. Julia", "DOCTOR", DEMO_PASSWORD.DOCTOR);
  const secretary = await upsertUser("secretary", "أفنان (السكرتيرة)", "Afnan (Receptionist)", "SECRETARY", DEMO_PASSWORD.SECRETARY);

  if (accountant) {
    await prisma.user.update({ where: { id: accountant.id }, data: { status: "INACTIVE", name: "حساب محاسبة قديم", englishName: "Legacy accountant account" } });
    await prisma.employee.updateMany({ where: { userId: accountant.id }, data: { active: false } });
  }

  await upsertEmployeeFor(owner, "المدير العام", "General Manager", 1500);
  await upsertEmployeeFor(sameh, "مالك / طبيب", "Owner / Doctor", 1500);
  await upsertEmployeeFor(doctor, "طبيبة", "Doctor", 1200);
  await upsertEmployeeFor(secretary, "سكرتيرة", "Receptionist", 450);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: key === "appointmentsEnabled" ? { value: JSON.stringify(value) } : {},
      create: { key, value: JSON.stringify(value) },
    });
  }

  const customers = [
    { fullName: "نور خالد", phone: "0791111111", birthDate: new Date(1992, 4, 15), tags: ["متابعة"], marketingConsent: true, notes: "عميلة أولى للتجربة" },
    { fullName: "مريم العلي", phone: "0792222222", birthDate: new Date(1988, 9, 2), tags: ["علاج"], marketingConsent: true },
    { fullName: "هبة ناصر", phone: "0773333333", birthDate: new Date(1995, 0, 20), tags: [], marketingConsent: false },
    { fullName: "سلمى كمال", phone: "0784444444", birthDate: new Date(1979, 6, 8), tags: ["متابعة"], marketingConsent: true },
  ];
  for (const c of customers) {
    const existing = await prisma.customer.findFirst({ where: { phone: c.phone } });
    if (!existing) {
      await prisma.customer.create({ data: c });
    }
  }

  const services = [
    { name: "جلسة تنظيف وترطيب للوجه", englishName: "Facial cleansing and hydration", category: "تنظيف", defaultPrice: 40, durationMinutes: 45, notes: "غسل عميق، إزالة الرؤوس السوداء، وترطيب" },
    { name: "حقن بوتوكس الجبهة", englishName: "Forehead Botox injection", category: "حقن", defaultPrice: 120, durationMinutes: 20, notes: "بوتوكس المنطقة الأمامية — المدة تعتمد على عدد الوحدات" },
    { name: "حقن فيلر الشفاه", englishName: "Lip filler injection", category: "حقن", defaultPrice: 180, durationMinutes: 30, notes: "فيلر هيالورونيك 1 مل" },
    { name: "جلسة تقشير كيميائي", englishName: "Chemical peel session", category: "تقشير", defaultPrice: 55, durationMinutes: 40, notes: "تقشير سطحي بالحموض — يُمنع التعرض للشمس بعدها" },
    { name: "إزالة شعر الوجه بالليزر", englishName: "Facial laser hair removal", category: "ليزر", defaultPrice: 25 },
    { name: "جلسة بلازما للوجه", englishName: "Facial plasma session", category: "علاج", defaultPrice: 60 },
    { name: "حقن ميزوثيرابي", englishName: "Mesotherapy injection", category: "حقن", defaultPrice: 90 },
    { name: "جلسة بروفايلو", englishName: "Profhilo session", category: "علاج", defaultPrice: 120, durationMinutes: 50, notes: "علاج ترميمي بالفيلر الخفيف للوجه" },
  ];
  for (const s of services) {
    await firstOrCreate("service", s);
  }

  const supplier = await firstOrCreate("supplier", { name: "مستودع عمان الطبي", phone: "064445566", contact: "أبو محمد" });

  const products = [
    { name: "سيروم هيالورونيك أسيد", englishName: "Hyaluronic acid serum", category: "مستحضرات", sku: "HY-100", stockUnit: "مل", purchaseUnit: "زجاجة", conversionToStock: 30, divisible: true, usagePrecision: 2, minStock: 2, trackExpiry: false, trackBatch: false, supplierId: (supplier as { id: string }).id, avgCost: 22 },
    { name: "كريم مرطب طبي", englishName: "Medical moisturizing cream", category: "مستحضرات", sku: "CM-200", stockUnit: "أنبوب", divisible: false, usagePrecision: 0, minStock: 3, trackExpiry: true, trackBatch: true, supplierId: (supplier as { id: string }).id, avgCost: 8 },
    { name: "مادة تخدير موضعي", englishName: "Local anesthetic", category: "مستلزمات طبية", sku: "LA-300", stockUnit: "مل", divisible: true, usagePrecision: 1, minStock: 5, trackExpiry: true, trackBatch: true, supplierId: (supplier as { id: string }).id, avgCost: 15 },
    { name: "قفازات طبية", englishName: "Medical gloves", category: "مستلزمات طبية", sku: "GL-400", stockUnit: "حبة", purchaseUnit: "علبة", conversionToStock: 100, divisible: false, usagePrecision: 0, minStock: 100, trackExpiry: false, trackBatch: false, supplierId: (supplier as { id: string }).id, avgCost: 12 },
    { name: "حقن بوتوكس", englishName: "Botox injection", category: "حقن", sku: "BT-500", stockUnit: "وحدة", purchaseUnit: "سرنجة", conversionToStock: 100, divisible: true, usagePrecision: 3, minStock: 50, trackExpiry: true, trackBatch: true, supplierId: (supplier as { id: string }).id, avgCost: 3.2 },
    { name: "حقن فيلر هيالورونيك", englishName: "Hyaluronic acid filler", category: "حقن", sku: "FL-600", stockUnit: "مل", purchaseUnit: "سرنجة", conversionToStock: 1, divisible: true, usagePrecision: 2, minStock: 5, trackExpiry: true, trackBatch: true, supplierId: (supplier as { id: string }).id, avgCost: 120 },
  ];
  const created: Record<string, { id: string }> = {};
  for (const p of products) {
    const row = await firstOrCreate("product", p);
    created[p.name] = row as { id: string };
    if (p.trackBatch) {
      const existing = await prisma.productBatch.findFirst({ where: { productId: (row as { id: string }).id } });
      if (!existing) {
        const expiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        await prisma.productBatch.create({
          data: {
            productId: (row as { id: string }).id,
            batchNo: `B-${Date.now().toString().slice(-5)}`,
            expiryDate: expiry,
            qtyOnHand: 20,
            receivedQty: 20,
            unitCost: p.avgCost,
            active: true,
          },
        });
      }
    }
  }
  void created;

  const medications = [
    { name: "ليدوكايين موضعي 2%", brand: "Zylocaine", form: "كريم", notes: "تخدير موضعي قبل الحقن", inventoryProductId: (created["مادة تخدير موضعي"] as { id: string } | undefined)?.id ?? null },
    { name: "باراسيتامول 500mg", form: "أقراص", notes: "مسكن عام" },
    { name: "إيبوبروفين 400mg", form: "أقراص", notes: "مضاد التهاب ومسكن" },
    { name: "فيتامين C فوار", form: "فوار", notes: "مضاد أكسدة بعد التقشير" },
    { name: "مضاد حيوي موضعي (فيوسيدين)", form: "مرهم", notes: "وقائي بعد الحقن" },
  ];
  for (const m of medications) {
    await firstOrCreate("medication", m);
  }

  const categoryDefs = [
    { name: "إيجار العيادة", kind: "RENT" },
    { name: "مستحضرات ومواد", kind: "MEDICAL" },
    { name: "رواتب", kind: "PAYROLL" },
    { name: "تسويق وإعلان", kind: "MARKETING" },
    { name: "كهرباء وماء", kind: "UTILITIES" },
    { name: "أخرى", kind: "OTHER" },
  ];
  for (const c of categoryDefs) {
    await firstOrCreate("expenseCategory", c);
  }

  console.log("Seed complete.");
  console.log("حسابات الدخول (كلمات المرور مؤقتة — سيُطلب تغييرها عند أول تسجيل دخول):");
  console.log({ dr_ahmad_owner: DEMO_PASSWORD.OWNER, dr_sameh_owner: DEMO_PASSWORD.MAIN_DOCTOR, doctor_julia: DEMO_PASSWORD.DOCTOR, secretary_afnan: DEMO_PASSWORD.SECRETARY });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
