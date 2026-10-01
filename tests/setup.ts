import { PrismaClient, type Role } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/authorize";

process.env.DATABASE_URL = "postgresql://clinic:clinic_dev_password@localhost:5432/clinic_test?schema=public";
(process.env as Record<string, string>).NODE_ENV = "test";

export const db = new PrismaClient();

/** Materialized DOCTOR preset — the way the app stores explicit defaults for non-owner accounts. */
export function mainDoctorOverrides(): string[] {
  // dynamic import is avoided here to keep the seed-world synchronous:
  // replicate entriesFromMap(materializePreset("DOCTOR")) for the codes that matter,
  // plus explicit DENY for closing review/approve (hard-blocked for DOCTOR by default).
  const entries: string[] = [];
  for (const code of ["patients.read", "patients.create", "patients.view_medical", "patients.edit_medical", "visits.manage", "visits.assign_doctor", "treatments.record", "treatments.price", "treatments.send_to_cashier", "inventory.read", "purchases.request", "purchases.receive", "appointments.read", "crm.manage", "messages.send_transactional"]) {
    entries.push(`GRANT:${code}`);
  }
  entries.push("DENY:closing.prepare", "DENY:closing.review", "DENY:closing.approve");
  return entries.sort();
}

export async function resetDb(): Promise<void> {
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

export function fakeUser(username: string, name: string, role: Role, id = `${role}-${username}`, permissionOverrides: string[] = []): AuthUser {
  return { id, username, name, englishName: null, role, mustChangePassword: false, permissionOverrides, jobTitle: null };
}

export interface SeedWorld {
  owner: AuthUser;
  doctor: AuthUser;
  /** The Main Doctor (طبيب رئيسي): DOCTOR role with materialized permissions — closing review/approve blocked by default. */
  mainDoctor: AuthUser;
  secretary: AuthUser;
  accountant: AuthUser;
  customerId: string;
  serviceId: string;
  productId: string;
  batchId: string;
  categoryId: string;
}

/** Fresh DB + master data for one test run. */
export async function seedWorld(): Promise<SeedWorld> {
  await resetDb();

  const ownerRow = await db.user.create({
    data: { username: "owner", name: "المالك", role: "OWNER", passwordHash: "x" },
  });
  const doctorRow = await db.user.create({
    data: { username: "doctor", name: "الدكتورة", role: "DOCTOR", passwordHash: "x" },
  });
  const mainDoctorRow = await db.user.create({
    data: { username: "dr.sameh", name: "د. سامح", role: "DOCTOR", passwordHash: "x", permissionOverrides: mainDoctorOverrides() },
  });
  const secretaryRow = await db.user.create({
    data: { username: "secretary", name: "الاستقبال", role: "SECRETARY", passwordHash: "x" },
  });
  const accountantRow = await db.user.create({
    data: { username: "accountant", name: "المحاسبة", role: "ACCOUNTANT", passwordHash: "x" },
  });

  const owner = fakeUser("owner", "المالك", "OWNER", ownerRow.id);
  const doctor = fakeUser("doctor", "الدكتورة", "DOCTOR", doctorRow.id);
  const mainDoctor = fakeUser("dr.sameh", "د. سامح", "DOCTOR", mainDoctorRow.id, mainDoctorRow.permissionOverrides);
  mainDoctor.jobTitle = "طبيب رئيسي";
  const secretary = fakeUser("secretary", "الاستقبال", "SECRETARY", secretaryRow.id);
  const accountant = fakeUser("accountant", "المحاسبة", "ACCOUNTANT", accountantRow.id);

  await db.employee.create({
    data: { userId: doctorRow.id, name: "الدكتورة", jobTitle: "طبيبة", monthlySalary: 1200, startDate: new Date(), active: true },
  });
  await db.employee.create({
    data: { userId: mainDoctorRow.id, name: "د. سامح", jobTitle: "طبيب رئيسي", monthlySalary: 1500, startDate: new Date(), active: true },
  });
  await db.employee.create({
    data: { userId: accountantRow.id, name: "المحاسبة", jobTitle: "محاسبة", monthlySalary: 700, startDate: new Date(), active: true },
  });

  const customer = await db.customer.create({
    data: { fullName: "نور خالد", phone: "0791234567", marketingConsent: true },
  });
  const service = await db.service.create({
    data: { name: "تنظيف الوجه", category: "تنظيف", defaultPrice: 40, active: true, createdById: ownerRow.id },
  });
  const product = await db.product.create({
    data: {
      name: "مصل هيالورونيك",
      category: "مستحضرات",
      stockUnit: "مل",
      minStock: 2,
      avgCost: 10,
      trackBatch: true,
      trackExpiry: true,
      active: true,
      createdById: ownerRow.id,
    },
  });
  const batch = await db.productBatch.create({
    data: {
      productId: product.id,
      batchNo: "TEST-1",
      expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      qtyOnHand: 10,
      receivedQty: 10,
      unitCost: 10,
      active: true,
    },
  });
  const category = await db.expenseCategory.create({
    data: { name: "مستحضرات", kind: "MEDICAL", active: true, createdById: ownerRow.id },
  });

  return { owner, doctor, mainDoctor, secretary, accountant, customerId: customer.id, serviceId: service.id, productId: product.id, batchId: batch.id, categoryId: category.id };
}

/** Creates a visit and walks it to TREATMENT_COMPLETED (ready for cashier/send). */
export async function createVisitToCompletion(w: SeedWorld, basePrice = 100, materials?: { productId: string; batchId: string | null; qtyUsed: number }[]) {
  const { createVisit, checkInVisit, startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
  const { saveTreatmentDraft } = await import("@/server/services/treatment-service");

  const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id, notes: null });
  await checkInVisit(w.secretary, visitId);
  await startWithDoctor(w.doctor, visitId);
  await completeTreatmentClinically(w.doctor, visitId);
  await saveTreatmentDraft(w.doctor, visitId, {
    services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
    materials: materials ?? [{ productId: w.productId, batchId: w.batchId, qtyUsed: 2 }],
    basePrice,
    notes: null,
  });
  return visitId;
}
