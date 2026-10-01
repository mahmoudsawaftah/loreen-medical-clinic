import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, db, type SeedWorld } from "./setup";

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
});

async function payrollSvc() {
  return import("@/server/services/payroll-service");
}

async function expectForbidden(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
}

describe("employees-v3: salary history and protected deletion", () => {
  it("creating an employee opens an opening salary row (راتب افتتاحي)", async () => {
    const { createEmployee, listSalaryHistory } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });
    const rows = await listSalaryHistory(w.owner, id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("راتب افتتاحي");
    expect(rows[0].effectiveTo).toBeNull();
    expect(Number(rows[0].monthlySalary)).toBe(900);
    const emp = await db.employee.findUnique({ where: { id } });
    expect(Number(emp?.monthlySalary)).toBe(900);
  });

  it("changeSalary closes the open row and opens a new effective period", async () => {
    const { createEmployee, changeSalary, listSalaryHistory } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });
    await changeSalary(w.owner, id, { monthlySalary: 1100, effectiveFrom: "2026-03-01", reason: "تقييم" });

    const rows = await listSalaryHistory(w.owner, id);
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].monthlySalary)).toBe(1100);
    expect(rows[0].effectiveTo).toBeNull();
    expect(Number(rows[1].monthlySalary)).toBe(900);
    expect(rows[1].effectiveTo?.toISOString().slice(0, 10)).toBe("2026-03-01");
    const emp = await db.employee.findUnique({ where: { id } });
    expect(Number(emp?.monthlySalary)).toBe(1100);
  });

  it("endEmployment closes the open salary row and marks the employee inactive", async () => {
    const { createEmployee, endEmployment, listSalaryHistory } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });
    await endEmployment(w.owner, id, "2026-06-30");

    const emp = await db.employee.findUnique({ where: { id } });
    expect(emp?.active).toBe(false);
    expect(emp?.endDate?.toISOString().slice(0, 10)).toBe("2026-06-30");
    const rows = await listSalaryHistory(w.owner, id);
    expect(rows[0].effectiveTo?.toISOString().slice(0, 10)).toBe("2026-06-30");
  });

  it("endEmployment rejects an already-inactive employee", async () => {
    const { createEmployee, endEmployment } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });
    await endEmployment(w.owner, id, "2026-06-30");
    await expect(endEmployment(w.owner, id, "2026-07-01")).rejects.toMatchObject({
      message: "الموظف ليس في الخدمة حاليًا",
    });
  });

  it("reactivateEmployee reopens employment and opens a fresh salary row", async () => {
    const { createEmployee, endEmployment, reactivateEmployee, listSalaryHistory } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });
    await endEmployment(w.owner, id, "2026-06-30");
    await reactivateEmployee(w.owner, id);

    const emp = await db.employee.findUnique({ where: { id } });
    expect(emp?.active).toBe(true);
    expect(emp?.endDate).toBeNull();
    const rows = await listSalaryHistory(w.owner, id);
    expect(rows[0].effectiveTo).toBeNull();
    expect(rows[0].reason).toBe("إعادة تفعيل الخدمة");
    expect(Number(rows[0].monthlySalary)).toBe(900);
  });

  it("deleteEmployee refuses when salary history beyond the opening row exists", async () => {
    const { createEmployee, changeSalary, deleteEmployee } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });
    await changeSalary(w.owner, id, { monthlySalary: 1100, effectiveFrom: "2026-03-01", reason: "تقييم" });

    await expect(deleteEmployee(w.owner, id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "لا يمكن حذف هذا الموظف لوجود سجل سابق مرتبط به. يمكنك تعطيله.",
    });
    expect(await db.employee.count({ where: { id } })).toBe(1);
  });

  it("deleteEmployee refuses when the linked account has operational history", async () => {
    const { createEmployee, deleteEmployee } = await payrollSvc();
    const ownerRow = await db.user.findUnique({ where: { username: "owner" } });
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05", userId: ownerRow!.id });

    await expect(deleteEmployee(w.owner, id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.employee.count({ where: { id } })).toBe(1);
  });

  it("an employee with only the opening row can be deleted permanently", async () => {
    const { createEmployee, deleteEmployee } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });
    await deleteEmployee(w.owner, id);

    expect(await db.employee.count({ where: { id } })).toBe(0);
    expect(await db.salaryHistory.count({ where: { employeeId: id } })).toBe(0);
  });

  it("ensurePayrollPeriod snapshots active employees and the cost stays historical", async () => {
    const { createEmployee, ensurePayrollPeriod, payrollCostForPeriod, dailyPayrollCost } = await payrollSvc();
    await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });

    const periodId = await ensurePayrollPeriod(w.owner, 8, 2026);
    const period = await db.payrollPeriod.findUnique({ where: { id: periodId }, include: { items: true } });
    expect(period?.items).toHaveLength(4);
    expect(await payrollCostForPeriod(w.owner, 8, 2026)).toBe(4300);

    const daily = await dailyPayrollCost(w.owner, 2026, 8);
    expect(daily.totalMonthly).toBe(4300);
    expect(daily.mode).toBeTruthy();
    expect(daily.dailyShare).toBeGreaterThan(0);
  });

  it("payroll mutations are gated to the payroll permission (secretary rejected)", async () => {
    const { createEmployee, changeSalary, endEmployment, deleteEmployee, listSalaryHistory } = await payrollSvc();
    const { id } = await createEmployee(w.owner, { name: "منى", jobTitle: "مساعدة", monthlySalary: 900, startDate: "2026-01-05" });

    await expectForbidden(changeSalary(w.secretary, id, { monthlySalary: 1100, effectiveFrom: "2026-03-01", reason: "x" }));
    await expectForbidden(endEmployment(w.secretary, id, "2026-06-30"));
    await expectForbidden(deleteEmployee(w.secretary, id));
    await expectForbidden(listSalaryHistory(w.secretary, id));

    const rows = await listSalaryHistory(w.owner, id);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].monthlySalary)).toBe(900);
  });
});
