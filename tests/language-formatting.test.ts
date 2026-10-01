import { describe, expect, it } from "vitest";
import { NAV_GROUPS, navItemsFor } from "@/lib/navigation";
import { effectivePermissions } from "@/lib/permissions";
import { formatMoney } from "@/lib/time";

describe("English application shell regression coverage", () => {
  it("keeps the dashboard visible for an owner", () => {
    const permissions = effectivePermissions({ role: "OWNER", permissionOverrides: [] });
    expect(navItemsFor({ role: "OWNER", permissions })).toEqual(expect.arrayContaining([
      expect.objectContaining({ href: "/dashboard", labelKey: "nav.workspace" }),
    ]));
    expect(NAV_GROUPS.some((group) => group.hrefs.some((href) => href === "/dashboard"))).toBe(true);
  });

  it("formats money with an English currency label in English", () => {
    const english = formatMoney(125, "JOD", "en");
    const arabic = formatMoney(125, "JOD", "ar");
    expect(english).toContain("JOD");
    expect(english).not.toContain("د.أ");
    expect(arabic).toContain("د.أ");
  });
});
