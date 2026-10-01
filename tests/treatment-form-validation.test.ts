import { describe, expect, it } from "vitest";
import { validateTreatmentForm } from "@/lib/visits/treatment-validation";

describe("treatment form validation", () => {
  it("accepts an optional empty service row when a procedure and price exist", () => {
    expect(validateTreatmentForm({
      services: [{ description: "بوتوكس" }, { description: "   " }],
      materials: [],
      basePrice: "34",
    })).toBeNull();
  });

  it("returns a visible validation key instead of relying on native form blocking", () => {
    expect(validateTreatmentForm({
      services: [{ description: "   " }],
      materials: [],
      basePrice: "",
    })).toBe("visits.validationProcedureRequired");
  });
});
