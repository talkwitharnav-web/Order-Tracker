/**
 * Order-naming-convention presets for the "Add New Order" form. Based on
 * common real-world restaurant/POS/KDS patterns: plain sequential numbers,
 * a letter+number ticket code (station/batch prefix), a customer-name-based
 * call ("the Starbucks effect" — calling a name rather than a number),
 * and a table/pager code. "Freeform" preserves the original manual-entry
 * behavior exactly, for kitchens that want to type whatever they want.
 */
export type NamingStyle = "sequential" | "letter-number" | "customer-name" | "table-pager" | "freeform";

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
 * and the server does not enforce any particular format (see
 * api/orders/route.ts's requireString — any non-empty string under 200
 * chars is accepted), so this never blocks an unusual value.
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
