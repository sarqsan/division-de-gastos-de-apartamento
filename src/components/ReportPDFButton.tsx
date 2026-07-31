import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BillLuz, BillAgua, ReadingLuz, PropertyDetails } from "../types";
import { calculateLuzSplit, calculateAguaSplit, getDaysBetween } from "../utils/calculator";
import { getReportImageDataUrl } from "../utils/pdfToImage";
import { FileText, Download, Loader2 } from "lucide-react";

interface ReportPDFButtonProps {
  property: PropertyDetails;
  billsLuz: BillLuz[];
  billsAgua: BillAgua[];
  readings: ReadingLuz[];
  selectedMonth: string; // YYYY-MM
  editingApartment?: "A" | "B";
}

export default function ReportPDFButton({ property, billsLuz, billsAgua, readings, selectedMonth, editingApartment }: ReportPDFButtonProps) {
  const [generating, setGenerating] = useState(false);
  
  const generatePDF = async () => {
    if (generating) return;
    setGenerating(true);

    try {
      const doc = new jsPDF();
      
      // Header Style
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.rect(0, 0, 210, 40, "F");
      
      doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("REPORTE MENSUAL DE CONSUMO Y GASTOS", 14, 18);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Propiedad: ${property.address}`, 14, 26);
    doc.text(`Periodo del Reporte: ${selectedMonth}`, 14, 32);
    
    // Filter bills for the selected month (starts in the selectedMonth or overlaps)
    const activeLuz = billsLuz.find(b => b.startDate.startsWith(selectedMonth) || b.endDate.startsWith(selectedMonth));
    const activeAgua = billsAgua.find(b => {
      // Water is quarterly, find if the selected month falls within its period
      const startYm = b.startDate.substring(0, 7);
      const endYm = b.endDate.substring(0, 7);
      return selectedMonth >= startYm && selectedMonth <= endYm;
    });

    let currentY = 50;

    // --- ELECTRICITY METHODOLOGY EXPLANATION ---
    if (activeLuz) {
      const splitResult = calculateLuzSplit(activeLuz, readings, editingApartment);
      
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("1. Desglose de Electricidad (Luz) - Mensual", 14, currentY);
      currentY += 6;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Factura Periodo: ${splitResult.startDate} al ${splitResult.endDate} (${splitResult.totalDays} días)`, 14, currentY);
      currentY += 5;
      doc.text(`Importe Total Factura: ${splitResult.totalAmount.toFixed(2)}€  (Fijo: ${splitResult.fixedCost.toFixed(2)}€ | Variable: ${splitResult.variableCost.toFixed(2)}€)`, 14, currentY);
      currentY += 8;

      // Table for Luz Split
      const totalKwBill = splitResult.kwhA + splitResult.kwhB;
      const rateVal = totalKwBill > 0 ? (splitResult.totalAmount / totalKwBill) : 0;
      const rateStr = `${rateVal.toFixed(4)}€/kWh`;
      const subApt = splitResult.editingApartment || "B";
      const otherApt = subApt === "A" ? "B" : "A";
      const kwhSub = subApt === "A" ? splitResult.kwhA : splitResult.kwhB;
      const kwhOth = subApt === "A" ? splitResult.kwhB : splitResult.kwhA;
      const amountSub = subApt === "A" ? splitResult.totalA : splitResult.totalB;
      const amountOth = subApt === "A" ? splitResult.totalB : splitResult.totalA;

      const headersLuz = [["Detalle", "Apartamento A", "Apartamento B", "Total Factura"]];
      const dataLuz = [
        ["Energía Consumida (kWh)", `${splitResult.kwhA.toFixed(2)} kWh`, `${splitResult.kwhB.toFixed(2)} kWh`, `${totalKwBill.toFixed(2)} kWh`],
        ["Proporción de Consumo (%)", `${(splitResult.pctA * 100).toFixed(1)}%`, `${(splitResult.pctB * 100).toFixed(1)}%`, "100%"],
        ["Precio del kW (€/kWh)", rateStr, rateStr, "-"],
        ["TOTAL A PAGAR ELECTRICIDAD", `${splitResult.totalA.toFixed(2)}€`, `${splitResult.totalB.toFixed(2)}€`, `${splitResult.totalAmount.toFixed(2)}€`]
      ];

      autoTable(doc, {
        startY: currentY,
        head: headersLuz,
        body: dataLuz,
        theme: "striped",
        headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
        styles: { fontSize: 8.5 },
        columnStyles: { 0: { fontStyle: "bold" } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;

      // EXPLANATION BOX FOR CALCULATION
      doc.setFillColor(243, 244, 246); // Slate 100
      doc.rect(14, currentY, 182, 34, "F");
      doc.setDrawColor(209, 213, 219);
      doc.rect(14, currentY, 182, 34, "D");

      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("EXPLICACIÓN Y METODOLOGÍA DEL CÁLCULO DE REPARTO:", 18, currentY + 6);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      
      doc.text(`1. Precio por kW = Total Importe (${splitResult.totalAmount.toFixed(2)}€) / Total kW Factura (${totalKwBill.toFixed(2)} kWh) = ${rateStr}.`, 18, currentY + 12);
      doc.text(`2. Consumo Apt ${subApt} = Suma de todas las lecturas registradas del periodo = ${kwhSub.toFixed(2)} kWh.`, 18, currentY + 17);
      doc.text(`3. Importe Apt ${subApt} = ${kwhSub.toFixed(2)} kWh × ${rateStr} = ${amountSub.toFixed(2)}€.`, 18, currentY + 22);
      doc.text(`4. Importe Apt ${otherApt} = Total Factura (${splitResult.totalAmount.toFixed(2)}€) - Importe Apt ${subApt} (${amountSub.toFixed(2)}€) = ${amountOth.toFixed(2)}€.`, 18, currentY + 27);

      currentY += 40;

      // REGISTERED READINGS TABLE IN THE PERIOD
      // Filter readings within the bill period (or matching selectedMonth)
      const periodReadings = readings
        .filter(r => r.date >= splitResult.startDate && r.date < splitResult.endDate)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (periodReadings.length > 0) {
        if (currentY > 220) {
          doc.addPage();
          currentY = 20;
        }

        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`Detalle de Lecturas Diarias Registradas en el Periodo (${periodReadings.length} lecturas)`, 14, currentY);
        currentY += 5;

        const headersReadings = [["Fecha", "Apto / Contador", "Lectura Registrada (kWh)", "Estado / Método de Captura"]];
        const dataReadings = periodReadings.map(r => [
          r.date,
          `Apartamento ${r.apartment}`,
          `${r.value.toFixed(1)} kWh`,
          r.imageUrl ? "Foto de Contador Sincronizada (IA)" : "Registro Manual de Lectura"
        ]);

        autoTable(doc, {
          startY: currentY,
          head: headersReadings,
          body: dataReadings,
          theme: "grid",
          headStyles: { fillColor: [51, 65, 85] }, // Slate 700
          styles: { fontSize: 8 },
          columnStyles: { 2: { fontStyle: "bold" } }
        });

        currentY = (doc as any).lastAutoTable.finalY + 12;
      }
    } else {
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("1. Desglose de Electricidad (Luz) - Mensual", 14, currentY);
      currentY += 6;
      doc.setFont("helvetica", "oblique");
      doc.setFontSize(9);
      doc.text("No se ha registrado factura de luz para este periodo.", 14, currentY);
      currentY += 12;
    }

    // --- WATER SECTION ---
    if (activeAgua) {
      const splitAgua = calculateAguaSplit(activeAgua);
      
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("2. Desglose de Agua - Trimestral", 14, currentY);
      currentY += 6;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Factura Periodo Trimestral: ${splitAgua.startDate} al ${splitAgua.endDate} (${splitAgua.totalDays} días)`, 14, currentY);
      currentY += 5;
      doc.text(`Importe Trimestral Completo: ${splitAgua.totalAmount.toFixed(2)}€ (Se divide equitativamente 50/50)`, 14, currentY);
      currentY += 8;

      const headersAgua = [["Concepto", "Apartamento A", "Apartamento B", "Total Factura"]];
      const dataAgua = [
        ["Cuota Parte del Periodo", `${splitAgua.totalA.toFixed(2)}€`, `${splitAgua.totalB.toFixed(2)}€`, `${splitAgua.totalAmount.toFixed(2)}€`],
        ["Coste Diario Equivalente", `${splitAgua.dailyCostA.toFixed(2)}€/día`, `${splitAgua.dailyCostB.toFixed(2)}€/día`, `${splitAgua.dailyCostTotal.toFixed(2)}€/día`],
        ["Coste Mensual Equivalente", `${splitAgua.monthlyCostA.toFixed(2)}€/mes`, `${splitAgua.monthlyCostB.toFixed(2)}€/mes`, `${splitAgua.monthlyCostTotal.toFixed(2)}€/mes`]
      ];

      autoTable(doc, {
        startY: currentY,
        head: headersAgua,
        body: dataAgua,
        theme: "striped",
        headStyles: { fillColor: [14, 165, 233] }, // Sky 500
        styles: { fontSize: 8.5 },
        columnStyles: { 0: { fontStyle: "bold" } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;
    } else {
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("2. Desglose de Agua - Trimestral", 14, currentY);
      currentY += 6;
      doc.setFont("helvetica", "oblique");
      doc.setFontSize(9);
      doc.text("No se ha registrado factura de agua para este periodo.", 14, currentY);
      currentY += 12;
    }

    // --- TOTAL SUMMARY ---
    doc.setFillColor(248, 250, 252); // Slate 50
    doc.rect(14, currentY, 182, 35, "F");
    
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, currentY, 182, 35, "D");
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("RESUMEN DE PAGOS PARA EL MES", 20, currentY + 8);
    
    // Calculate totals
    const lA = activeLuz ? calculateLuzSplit(activeLuz, readings, editingApartment).totalA : 0;
    const lB = activeLuz ? calculateLuzSplit(activeLuz, readings, editingApartment).totalB : 0;
    
    // For water, we charge the monthly equivalent for that month
    const wA = activeAgua ? calculateAguaSplit(activeAgua).monthlyCostA : 0;
    const wB = activeAgua ? calculateAguaSplit(activeAgua).monthlyCostB : 0;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(`APARTAMENTO A: Luz (${lA.toFixed(2)}€) + Agua (${wA.toFixed(2)}€/mes) = `, 20, currentY + 18);
    doc.setFont("helvetica", "bold");
    doc.text(`${(lA + wA).toFixed(2)}€`, 130, currentY + 18);
    
    doc.setFont("helvetica", "normal");
    doc.text(`APARTAMENTO B: Luz (${lB.toFixed(2)}€) + Agua (${wB.toFixed(2)}€/mes) = `, 20, currentY + 26);
    doc.setFont("helvetica", "bold");
    doc.text(`${(lB + wB).toFixed(2)}€`, 130, currentY + 26);

    // Footer
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text("Documento generado automáticamente por Dividir Facturas de Piso - Firebase & Gemini AI.", 14, 280);
    
    // --- ATTACHED BILL IMAGES ANNEX ---
    if (activeLuz?.fileUrl) {
      const imgLuz = await getReportImageDataUrl(activeLuz.fileUrl);
      if (imgLuz) {
        doc.addPage();
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 210, 18, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("ANEXO: Factura Oficial de Electricidad (Luz)", 14, 12);

        const maxW = 180;
        const maxH = 230;
        let w = imgLuz.width;
        let h = imgLuz.height;
        const ratio = Math.min(maxW / w, maxH / h);
        w = w * ratio;
        h = h * ratio;
        const xPos = (210 - w) / 2;
        doc.addImage(imgLuz.dataUrl, "JPEG", xPos, 28, w, h);
      }
    }

    if (activeAgua?.fileUrl) {
      const imgAgua = await getReportImageDataUrl(activeAgua.fileUrl);
      if (imgAgua) {
        doc.addPage();
        doc.setFillColor(15, 118, 110);
        doc.rect(0, 0, 210, 18, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("ANEXO: Factura Oficial de Agua", 14, 12);

        const maxW = 180;
        const maxH = 230;
        let w = imgAgua.width;
        let h = imgAgua.height;
        const ratio = Math.min(maxW / w, maxH / h);
        w = w * ratio;
        h = h * ratio;
        const xPos = (210 - w) / 2;
        doc.addImage(imgAgua.dataUrl, "JPEG", xPos, 28, w, h);
      }
    }

    // Save PDF
    doc.save(`Reporte_Gastos_${property.address.replace(/\s+/g, "_")}_${selectedMonth}.pdf`);
    } catch (err) {
      console.error("Error generating monthly report PDF:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={generatePDF}
      disabled={generating}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider rounded border border-slate-250 transition cursor-pointer shadow-xs disabled:opacity-60"
    >
      {generating ? (
        <Loader2 className="h-3.5 w-3.5 text-slate-500 animate-spin" />
      ) : (
        <FileText className="h-3.5 w-3.5 text-slate-500" />
      )}
      <span>{generating ? "Generando..." : "Reporte PDF"}</span>
    </button>
  );
}
