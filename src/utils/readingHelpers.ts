export function extractDateFromFile(file: File): string {
  const name = file.name;

  // 1. Try to find MM/DD/YYYY or MM-DD-YYYY or MM_DD_YYYY (Month FIRST, Day SECOND, e.g., 06/07/2026 -> 7 de Junio)
  const matchMonthFirstFull = name.match(/\b(\d{1,2})[-_./](\d{1,2})[-_./](\d{4})\b/);
  if (matchMonthFirstFull) {
    const month = parseInt(matchMonthFirstFull[1], 10);
    const day = parseInt(matchMonthFirstFull[2], 10);
    const year = parseInt(matchMonthFirstFull[3], 10);
    if (year >= 2020 && year <= 2040 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${year}-${mStr}-${dStr}`;
    }
  }

  // 2. Try to find short MM/DD or MM-DD or MM_DD (Month FIRST, Day SECOND, e.g., "06/07" -> Month 06 (June), Day 07 -> 2026-06-07)
  const matchMonthFirstShort = name.match(/\b(\d{1,2})[-_./](\d{1,2})\b/);
  if (matchMonthFirstShort) {
    const month = parseInt(matchMonthFirstShort[1], 10);
    const day = parseInt(matchMonthFirstShort[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const currentYear = new Date().getFullYear();
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${currentYear}-${mStr}-${dStr}`;
    }
  }

  // 3. Try ISO YYYY-MM-DD or YYYY_MM_DD or YYYY/MM/DD
  const matchIso = name.match(/\b(\d{4})[-_./](\d{1,2})[-_./](\d{1,2})\b/);
  if (matchIso) {
    const year = parseInt(matchIso[1], 10);
    const month = parseInt(matchIso[2], 10);
    const day = parseInt(matchIso[3], 10);
    if (year >= 2020 && year <= 2040 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${year}-${mStr}-${dStr}`;
    }
  }

  // 4. Try to find YYYYMMDD
  const matchJoined = name.match(/\b(\d{4})(\d{2})(\d{2})\b/);
  if (matchJoined) {
    const year = parseInt(matchJoined[1], 10);
    const month = parseInt(matchJoined[2], 10);
    const day = parseInt(matchJoined[3], 10);
    if (year >= 2020 && year <= 2040 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const mStr = month.toString().padStart(2, '0');
      const dStr = day.toString().padStart(2, '0');
      return `${year}-${mStr}-${dStr}`;
    }
  }

  // Fallback to lastModified timestamp
  if (file.lastModified) {
    try {
      const d = new Date(file.lastModified).toISOString().split("T")[0];
      return d;
    } catch (e) {
      // Ignore
    }
  }

  return new Date().toISOString().split("T")[0];
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
