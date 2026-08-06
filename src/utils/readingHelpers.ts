export function normalizeYear(extractedYear: number, month: number, targetYear?: number): number {
  const currentYear = targetYear || new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0 = January

  // If current month is January and reading month is December (12), anchor to currentYear - 1
  if (currentMonth === 0 && month === 12) {
    return currentYear - 1;
  }

  // If extracted year is in the past (e.g. < currentYear - 1) or in future (> currentYear + 1),
  // override with currentYear
  if (extractedYear < currentYear - 1 || extractedYear > currentYear + 1) {
    return currentYear;
  }

  return extractedYear;
}

export function extractDateFromFile(file: File, targetYear?: number): string {
  const name = file.name;
  const currentYear = targetYear || new Date().getFullYear();

  // 1. Try to find MM/DD/YYYY or MM-DD-YYYY or MM_DD_YYYY (Month FIRST, Day SECOND, e.g., 06/07/2026 -> 7 de Junio)
  const matchMonthFirstFull = name.match(/\b(\d{1,2})[-_./](\d{1,2})[-_./](\d{4})\b/);
  if (matchMonthFirstFull) {
    const month = parseInt(matchMonthFirstFull[1], 10);
    const day = parseInt(matchMonthFirstFull[2], 10);
    const year = parseInt(matchMonthFirstFull[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const validYear = normalizeYear(year, month, currentYear);
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${validYear}-${mStr}-${dStr}`;
    }
  }

  // 2. Try to find short MM/DD or MM-DD or MM_DD (Month FIRST, Day SECOND, e.g., "06/07" -> Month 06 (June), Day 07 -> 2026-06-07)
  const matchMonthFirstShort = name.match(/\b(\d{1,2})[-_./](\d{1,2})\b/);
  if (matchMonthFirstShort) {
    const month = parseInt(matchMonthFirstShort[1], 10);
    const day = parseInt(matchMonthFirstShort[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const validYear = normalizeYear(currentYear, month, currentYear);
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${validYear}-${mStr}-${dStr}`;
    }
  }

  // 3. Try ISO YYYY-MM-DD or YYYY_MM_DD or YYYY/MM/DD
  const matchIso = name.match(/\b(\d{4})[-_./](\d{1,2})[-_./](\d{1,2})\b/);
  if (matchIso) {
    const year = parseInt(matchIso[1], 10);
    const month = parseInt(matchIso[2], 10);
    const day = parseInt(matchIso[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const validYear = normalizeYear(year, month, currentYear);
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${validYear}-${mStr}-${dStr}`;
    }
  }

  // 4. Try to find YYYYMMDD
  const matchJoined = name.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (matchJoined) {
    const year = parseInt(matchJoined[1], 10);
    const month = parseInt(matchJoined[2], 10);
    const day = parseInt(matchJoined[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const validYear = normalizeYear(year, month, currentYear);
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${validYear}-${mStr}-${dStr}`;
    }
  }

  // Fallback to lastModified timestamp, anchored to valid year
  if (file.lastModified) {
    try {
      const d = new Date(file.lastModified);
      const validYear = normalizeYear(d.getFullYear(), d.getMonth() + 1, currentYear);
      const mStr = (d.getMonth() + 1).toString().padStart(2, '0');
      const dStr = d.getDate().toString().padStart(2, '0');
      return `${validYear}-${mStr}-${dStr}`;
    } catch (e) {
      // Ignore
    }
  }

  return `${currentYear}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getDate().toString().padStart(2, '0')}`;
}

export function extractKwFromFile(file: File): string {
  const name = file.name;

  // Try to find a number followed by kWh, kwh, kw, kW, with or without spaces (e.g. 1465.2_kwh)
  const kwhMatch = name.match(/(\d+(?:[.,]\d+)?)\s*(?:kwh|kw)\b/i);
  if (kwhMatch) {
    const cleanNum = kwhMatch[1].replace(",", ".");
    const val = parseFloat(cleanNum);
    if (!isNaN(val)) return val.toString();
  }

  // Try to find stand-alone numbers that look like meter values (e.g., 1465 or 1465.5)
  const genericMatch = name.match(/\b(\d{3,6}(?:[.,]\d{1,2})?)\b/);
  if (genericMatch) {
    const candidate = genericMatch[1].replace(",", ".");
    // Filter out years like 2026 or 2025
    if (candidate !== "2025" && candidate !== "2026" && candidate !== "2024") {
      const val = parseFloat(candidate);
      if (!isNaN(val)) return val.toString();
    }
  }

  return "";
}
