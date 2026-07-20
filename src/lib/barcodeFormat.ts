// Small packaging - trial sizes, cosmetics, and (per this app's own
// bug report) individual cans pulled out of a multipack case - often
// can't fit a full 12-digit UPC-A barcode. UPC-E is the standard
// workaround: the same UPC-A, with (mostly zero) digits squeezed out by a
// defined compression rule, printed as 8 digits instead of 12.
//
// It is NOT a different or unrelated code, and expanding it does NOT
// relate an individual item to whatever case/multipack it might have come
// from - a case has its own separate UPC-A registered for itself as a
// sellable unit. This only recovers the individual item's OWN full-length
// barcode from its compressed form, which matters because both the shared
// community database (communityLookup.ts) and the external UPCitemdb
// lookup (productLookup.ts) are keyed by the full 12-digit form - a raw,
// un-expanded 8-digit scan mostly comes back "not found" even when the
// product genuinely is on file under its UPC-A.
//
// Ported from @zxing/library's own UPCEReader.convertUPCEtoUPCA (this
// app's scanner already depends on @zxing/library - see ScanTab.tsx) -
// see node_modules/@zxing/library/esm/core/oned/UPCEReader.js - so this
// always agrees with the exact expansion rule the scanner itself uses
// internally when it decodes a UPC-E symbol, rather than risking a
// slightly-different, hand-rolled version of the same table.

export function expandUpcEtoUpcA(code: string): string | null {
  const digits = code.trim();
  if (!/^\d{8}$/.test(digits)) return null;

  const numberSystem = digits[0];
  const mid = digits.slice(1, 7); // the 6 compressed digits
  const checkDigit = digits[7];
  const lastMidDigit = mid[5];

  let expandedMid: string;
  switch (lastMidDigit) {
    case "0":
    case "1":
    case "2":
      // First 2 digits, then the case digit itself, then 4 zeros, then the
      // remaining 3 digits.
      expandedMid = mid.slice(0, 2) + lastMidDigit + "0000" + mid.slice(2, 5);
      break;
    case "3":
      // First 3 digits, then 5 zeros, then the remaining 2 digits.
      expandedMid = mid.slice(0, 3) + "00000" + mid.slice(3, 5);
      break;
    case "4":
      // First 4 digits, then 5 zeros, then the remaining 1 digit.
      expandedMid = mid.slice(0, 4) + "00000" + mid[4];
      break;
    default:
      // 5-9: first 5 digits, then 4 zeros, then the case digit itself.
      expandedMid = mid.slice(0, 5) + "0000" + lastMidDigit;
      break;
  }

  // The UPC-A check digit is carried straight over from UPC-E's own check
  // digit - it's not recalculated, since a valid UPC-E was compressed from
  // an already-valid UPC-A that had this exact check digit to begin with.
  return numberSystem + expandedMid + checkDigit;
}
