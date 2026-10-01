import type { I18nKey } from "@/lib/i18n/dict";

interface TreatmentFormValidationInput {
  services: { description: string }[];
  materials: { productId: string; qty: string }[];
  basePrice: string;
}

/** Returns a translated dictionary key so dynamic form rows never fail silently. */
export function validateTreatmentForm(input: TreatmentFormValidationInput): I18nKey | null {
  if (!input.services.some((row) => row.description.trim())) {
    return "visits.validationProcedureRequired";
  }

  if (input.materials.some((row) => row.productId && (!Number.isFinite(Number(row.qty)) || Number(row.qty) <= 0))) {
    return "visits.validationMaterialQty";
  }

  if (!Number.isFinite(Number(input.basePrice)) || Number(input.basePrice) <= 0) {
    return "visits.validationBasePrice";
  }

  return null;
}
