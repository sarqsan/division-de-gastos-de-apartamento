import { BillLuz, BillAgua, ReadingLuz } from "../types";

export interface LuzSplitResult {
  billId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalAmount: number;
  fixedCost: number;
  variableCost: number;
  
  // Apt A details
  kwhA: number;
  pctA: number;
  fixedA: number;
  variableA: number;
  totalA: number;
  startReadingA?: number;
  endReadingA?: number;
  
  // Apt B details
  kwhB: number;
  pctB: number;
  fixedB: number;
  variableB: number;
  totalB: number;
  startReadingB?: number;
  endReadingB?: number;
  
  // Calculation details
  readingsFoundA: boolean;
  readingsFoundB: boolean;

  // New fields for mandatory daily upload tracking
  editingApartment: "A" | "B";
  missingDates: string[];
  isPendingReadings: boolean;
}

export interface AguaSplitResult {
  billId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalAmount: number;
  
  // Splitting (usually 50/50 since water meter readings are not uploaded daily)
  totalA: number;
  totalB: number;
  
  // Metrics
  dailyCostTotal: number;
  monthlyCostTotal: number;
  
  dailyCostA: number;
  monthlyCostA: number;
  dailyCostB: number;
  monthlyCostB: number;
}

// Helper to calculate days between dates
export function getDaysBetween(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
}

// Electricity bill calculator
export function calculateLuzSplit(
  bill: BillLuz, 
  readings: ReadingLuz[], 
  editingApartment: "A" | "B" = "B"
): LuzSplitResult {
  const totalDays = getDaysBetween(bill.startDate, bill.endDate);
  
  // Determine submeter apartment (defaults to B if not explicitly set or if B has readings)
  let submeterApt: "A" | "B" = editingApartment || "B";
  if (!editingApartment) {
    const hasB = readings.some(r => r.apartment === "B" && r.date >= bill.startDate && r.date < bill.endDate);
    const hasA = readings.some(r => r.apartment === "A" && r.date >= bill.startDate && r.date < bill.endDate);
    submeterApt = hasB ? "B" : (hasA ? "A" : "B");
  }

  // Parse startDate and endDate to extract missing dates within the billing period
  // Note: the billing period runs from startDate up to the day before endDate (current < end)
  const missingDates: string[] = [];
  const [startYear, startMonth, startDay] = bill.startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = bill.endDate.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  let current = new Date(start);
  
  while (current < end) {
    const y = current.getFullYear();
    const m = (current.getMonth() + 1).toString().padStart(2, "0");
    const d = current.getDate().toString().padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    
    const hasReading = readings.some(r => r.apartment === submeterApt && r.date === dateStr);
    if (!hasReading) {
      missingDates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  
  const isPendingReadings = missingDates.length > 0;

  // Filter readings for the submeter apartment within the bill period (exclusive of endDate)
  const submeterReadings = readings.filter(
    r => r.apartment === submeterApt && r.date >= bill.startDate && r.date < bill.endDate
  );

  // 1. Sum all readings in that period with two decimal precision
  const rawSumKw = submeterReadings.reduce((acc, r) => acc + (Number(r.value) || 0), 0);
  const submeterKw = Number(rawSumKw.toFixed(2));

  // 2. Price per kW (€/kWh) = total bill amount / total bill kW
  const costPerKwh = bill.totalKwh > 0 ? (bill.totalAmount / bill.totalKwh) : 0;

  // 3. Amount for submeter apartment = sum of kW * price per kW (including 2 decimals)
  const rawSubmeterAmount = submeterKw * costPerKwh;
  const submeterAmount = Math.min(bill.totalAmount, Number(rawSubmeterAmount.toFixed(2)));

  // 4. Amount for other apartment = bill total amount - submeter apartment amount
  const otherAmount = Number((bill.totalAmount - submeterAmount).toFixed(2));

  let totalA = 0;
  let totalB = 0;
  let kwhA = 0;
  let kwhB = 0;
  let readingsFoundA = false;
  let readingsFoundB = false;

  if (submeterApt === "B") {
    kwhB = submeterKw;
    kwhA = Math.max(0, Number((bill.totalKwh - kwhB).toFixed(2)));
    totalB = submeterAmount;
    totalA = otherAmount;
    readingsFoundB = submeterReadings.length > 0;
    readingsFoundA = false;
  } else {
    kwhA = submeterKw;
    kwhB = Math.max(0, Number((bill.totalKwh - kwhA).toFixed(2)));
    totalA = submeterAmount;
    totalB = otherAmount;
    readingsFoundA = submeterReadings.length > 0;
    readingsFoundB = false;
  }

  const pctB = bill.totalKwh > 0 ? Number((kwhB / bill.totalKwh).toFixed(4)) : 0.5;
  const pctA = bill.totalKwh > 0 ? Number((kwhA / bill.totalKwh).toFixed(4)) : 0.5;

  // Fixed and variable breakdowns
  const fixedA = Number((bill.fixedCost / 2).toFixed(2));
  const fixedB = Number((bill.fixedCost / 2).toFixed(2));
  const variableA = Number((totalA - fixedA).toFixed(2));
  const variableB = Number((totalB - fixedB).toFixed(2));

  return {
    billId: bill.id,
    startDate: bill.startDate,
    endDate: bill.endDate,
    totalDays,
    totalAmount: bill.totalAmount,
    fixedCost: bill.fixedCost,
    variableCost: bill.variableCost,
    
    kwhA,
    pctA,
    fixedA,
    variableA,
    totalA,
    
    kwhB,
    pctB,
    fixedB,
    variableB,
    totalB,
    
    readingsFoundA,
    readingsFoundB,

    editingApartment: submeterApt,
    missingDates,
    isPendingReadings
  };
}

// Water bill calculator
export function calculateAguaSplit(bill: BillAgua): AguaSplitResult {
  const totalDays = getDaysBetween(bill.startDate, bill.endDate);
  
  // Divided 50/50 for two identical apartments
  const totalA = bill.totalAmount / 2;
  const totalB = bill.totalAmount / 2;

  const dailyCostTotal = bill.totalAmount / totalDays;
  const monthlyCostTotal = bill.totalAmount / 3; // quarterly bill is for 3 months

  const dailyCostA = totalA / totalDays;
  const monthlyCostA = totalA / 3;

  const dailyCostB = totalB / totalDays;
  const monthlyCostB = totalB / 3;

  return {
    billId: bill.id,
    startDate: bill.startDate,
    endDate: bill.endDate,
    totalDays,
    totalAmount: bill.totalAmount,
    
    totalA,
    totalB,
    
    dailyCostTotal,
    monthlyCostTotal,
    
    dailyCostA,
    monthlyCostA,
    dailyCostB,
    monthlyCostB
  };
}
