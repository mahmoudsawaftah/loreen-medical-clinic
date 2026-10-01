import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, db, type SeedWorld } from "./setup";

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
});

describe("CRM: follow-ups, birthdays, communication log", () => {
  it("creates a follow-up, keeps it in the queue, completes it CONTACTED", async () => {
    const { createFollowUp, followUpQueue, completeFollowUp } = await import("@/server/services/crm-service");
    const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { id } = await createFollowUp(w.secretary, {
      customerId: w.customerId,
      dueDate: due,
      type: "FOLLOW_UP",
      notes: "تذكير بالحجز",
    });

    const queue = await followUpQueue(w.secretary, { daysAhead: 7 });
    const mine = queue.tasks.find((t) => t.id === id);
    expect(mine).toBeTruthy();
    expect(mine?.status).toBe("PENDING");

    await completeFollowUp(w.secretary, id, "CONTACTED");
    const done = await db.followUpTask.findUnique({ where: { id } });
    expect(done?.status).toBe("CONTACTED");
    expect(done?.completedById).toBe(w.secretary.id);
  });

  it("flags customers whose birthday is within the horizon", async () => {
    const { createFollowUp, birthdayQueue } = await import("@/server/services/crm-service");
    void createFollowUp;
    const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const bdayCustomer = await db.customer.create({
      data: {
        fullName: "هبة عيد الميلاد",
        phone: "0799998888",
        birthDate: new Date(1990, in3Days.getMonth(), in3Days.getDate()),
        marketingConsent: true,
      },
    });
    const queue = await birthdayQueue(w.secretary, 14);
    expect(queue.some((x) => x.customer.id === bdayCustomer.id)).toBe(true);
  });

  it("records a communication log (mock provider) and marks the task contacted", async () => {
    const { sendCommunication } = await import("@/server/services/crm-service");
    const { createFollowUp } = await import("@/server/services/crm-service");
    const { id: taskId } = await createFollowUp(w.secretary, {
      customerId: w.customerId,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
    const { id: logId } = await sendCommunication(w.secretary, {
      customerId: w.customerId,
      channel: "mock",
      message: "سلام نور، عندك موعد بعد يومين",
      followUpTaskId: taskId,
    });
    const log = await db.communicationLog.findUnique({ where: { id: logId } });
    expect(log?.status).toBe("SENT");
    expect(log?.channel).toBe("MOCK");
    expect(log?.sentById).toBe(w.secretary.id);

    const task = await db.followUpTask.findUnique({ where: { id: taskId } });
    expect(task?.status).toBe("CONTACTED");
  });
});

describe("patients: profile, contact updates with log, medical events", () => {
  it("creates and searches a patient; phone update is logged", async () => {
    const { createPatient, searchPatients, updatePatientContact } = await import("@/server/services/patient-service");
    const { id, customerNo } = await createPatient(w.secretary, {
      fullName: "لينا حداد",
      phone: "0795554444",
      marketingConsent: true,
      tags: ["جديد"],
    });
    expect(customerNo).toBe(2); // customerNo 1 was taken by the seed world's baseline customer

    const found = await searchPatients(w.secretary, "لينا");
    expect(found.items.some((c) => c.id === id)).toBe(true);

    const byPhone = await searchPatients(w.secretary, "0795554444");
    expect(byPhone.items.some((c) => c.id === id)).toBe(true);

    await updatePatientContact(w.secretary, id, { phone: "0790001111" });
    const auditRows = await db.auditLog.findMany({ where: { entityType: "customer", action: "patient.update_contact", entityId: id } });
    expect(auditRows.length).toBeGreaterThan(0);
    expect(auditRows[0].afterJson).toContain("790001111"); // phone normalized: leading zero stripped
  });

  it("doctor records medical profile and events; profile editor is stored", async () => {
    const { updateMedicalProfile, addMedicalEvent } = await import("@/server/services/patient-service");
    await updateMedicalProfile(w.doctor, w.customerId, { allergies: "بنسلين", medicalNotes: "حساسية خفيفة", previousProcedures: ["ليزر"] });
    await addMedicalEvent(w.doctor, w.customerId, { procedureType: "تنظيف عميق", area: "الوجه", notes: "بدون مضاعفات" });

    const profile = await db.customerMedicalProfile.findUnique({ where: { customerId: w.customerId } });
    expect(profile?.allergies).toBe("بنسلين");
    expect(profile?.updatedByDoctorId).toBe(w.doctor.id);
    const events = await db.customerMedicalEvent.findMany({ where: { customerId: w.customerId } });
    expect(events).toHaveLength(1);
    expect(events[0].createdById).toBe(w.doctor.id);
  });
});