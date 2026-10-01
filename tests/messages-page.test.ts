import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

describe("messages page runtime safety", () => {
  it("the /messages page never calls useSearchParams in a server component", () => {
    const page = readFileSync(join(ROOT, "src", "app", "(app)", "messages", "page.tsx"), "utf8");
    expect(page).not.toContain("useSearchParams");
    expect(page).not.toContain('"use client"');
    expect(page).toContain("MessagesFilterBar");
  });

  it("the filter bar is the client-side owner of URL state and is marked 'use client'", () => {
    const bar = readFileSync(join(ROOT, "src", "components", "messages", "messages-filter-bar.tsx"), "utf8");
    expect(bar.startsWith('"use client"')).toBe(true);
    expect(bar).toContain("useSearchParams");
    expect(bar).toContain("useRouter");
  });

  it("the page builds the patch query itself and hands only a router to the client", () => {
    const page = readFileSync(join(ROOT, "src", "app", "(app)", "messages", "page.tsx"), "utf8");
    expect(page).toContain("URLSearchParams");
    expect(page).toContain("filters: CommunicationLogFilters");
  });
});