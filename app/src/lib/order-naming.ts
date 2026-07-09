/**
 * Order-naming-convention presets for the "Add New Order" form. Based on
 * common real-world restaurant/POS/KDS patterns: plain sequential numbers,
 * a letter+number ticket code (station/batch prefix), a customer-name-based
 * call ("the Starbucks effect" — calling a name rather than a number),
 * and a table/pager code. "Freeform" preserves the original manual-entry
 * behavior exactly, for kitchens that want to type whatever they want.
 */
export type NamingStyle = "sequential" | "letter-number" | "customer-name" | "table-pager" | "freeform";

const ORDER_DISPLAY_MAX_LENGTH = 200;

/**
 * Canonical customer/kitchen lookup key. Display punctuation, spacing, and
 * case are intentionally ignored, so "Pager 14", "pager-14", and "#PAGER14"
 * all identify the same order while the stored display label stays readable.
 */
export function normalizeOrderLookupKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Keeps only the same display-safe characters accepted by requireSafeName. */
export function formatOrderDisplayInput(value: string, uppercase = false): string {
  const formatted = value.replace(/[^A-Za-z0-9 '.,#_-]/g, "").slice(0, ORDER_DISPLAY_MAX_LENGTH);
  return uppercase ? formatted.toUpperCase() : formatted;
}

export const NAMING_STYLES: { value: NamingStyle; label: string; example: string }[] = [
  { value: "sequential", label: "Sequential Number", example: "e.g. 42" },
  { value: "letter-number", label: "Letter + Number", example: "e.g. A12" },
  { value: "customer-name", label: "Customer Name", example: "e.g. Alex" },
  { value: "table-pager", label: "Table / Pager Code", example: "e.g. 14" },
  { value: "freeform", label: "Freeform (type anything)", example: "e.g. ORD-54321" },
];

/**
 * Computes the next suggested order name for sequential/letter-number/
 * table-pager styles, given the restaurant's existing order names. Purely
 * a suggestion — the kitchen can still edit the field before submitting,
 * and the server accepts any display-safe label under 200 characters (see
 * api/orders/route.ts's requireSafeName), so this never blocks an unusual
 * real-world pickup identifier.
 */
export function suggestNextOrderName(style: NamingStyle, existingNames: string[]): string {
  if (style === "sequential" || style === "table-pager") {
    const maxNum = existingNames.reduce((max, name) => {
      const n = Number(name);
      return Number.isInteger(n) && n > max ? n : max;
    }, 0);
    return String(maxNum + 1);
  }

  if (style === "letter-number") {
    // Find the highest letter+number pair already used (e.g. "B7" -> letter
    // index 1, number 7), then continue counting within that letter up to
    // 99 before rolling to the next letter — mirrors the real-world
    // station/batch-letter convention researched for this feature.
    let bestLetterIndex = 0;
    let bestNumber = 0;
    for (const name of existingNames) {
      const match = /^([A-Z])(\d{1,3})$/.exec(name.toUpperCase());
      if (!match) continue;
      const letterIndex = match[1].charCodeAt(0) - 65;
      const number = Number(match[2]);
      if (letterIndex > bestLetterIndex || (letterIndex === bestLetterIndex && number > bestNumber)) {
        bestLetterIndex = letterIndex;
        bestNumber = number;
      }
    }
    const nextNumber = bestNumber >= 99 ? 1 : bestNumber + 1;
    const nextLetterIndex = bestNumber >= 99 ? Math.min(bestLetterIndex + 1, 25) : bestLetterIndex;
    return `${String.fromCharCode(65 + nextLetterIndex)}${nextNumber}`;
  }

  // customer-name / freeform have no auto-suggestion — the kitchen types the value.
  return "";
}
