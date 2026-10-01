import { describe, expect, it } from "vitest";
import { GRANULAR_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { navItemsFor } from "@/lib/navigation";

const allPermissions = [...Object.values(GRANULAR_PERMISSIONS), ...Object.values(PERMISSIONS)];

describe("workspace navigation", () => {
  it("gives the secretary one central work entry without duplicate daily links", () => {
    const hrefs = navItemsFor({ role: "SECRETARY", permissions: allPermissions }).map((item) => item.href);
    expect(hrefs[0]).toBe("/dashboard");
    expect(hrefs).toContain("/patients");
    expect(hrefs).not.toContain("/today");
    expect(hrefs).not.toContain("/visits");
    expect(hrefs).not.toContain("/ready-for-payment");
  });

  it("keeps the central work entry visible for doctors", () => {
    const hrefs = navItemsFor({ role: "DOCTOR", permissions: allPermissions }).map((item) => item.href);
    expect(hrefs[0]).toBe("/dashboard");
  });
});
