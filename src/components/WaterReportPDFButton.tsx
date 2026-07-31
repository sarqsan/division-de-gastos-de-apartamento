import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BillAgua, PropertyDetails } from "../types";
import { calculateAguaSplit } from "../utils/calculator";
import { getReportImageDataUrl } from "../utils/pdfToImage";
import { FileText, Droplet, Loader2 } from "lucide-react";

interface WaterReportPDFButtonProps {
  property: PropertyDetails;
  billAgua: BillAgua;
  label?: string;
  className?: string;
  variant?: "emerald" | "slate" | "icon";
}

export default function WaterReportPDFButton({
  property,
  billAgua,
  label = "Reporte PDF Agua",
  className = "",
  variant = "emerald"
}: WaterReportPDFButtonProps) {
  const [generating, setGenerating] = useState(false);

  const generatePDF = async () => {
    if (generating) return;
    setGenerating(true);

    try {
      const splitAgua = calculateAguaSplit(billAgua);
      const doc = new jsPDF();

      // --- HEADER BANNER ---
      doc.setFillColor(15, 118, 110); // Emerald 700
      doc.rect(0, 0, 210, 42, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("REPORTE DE FACTURA Y GASTO DE AGUA", 14, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(`Inmueble: ${property.address}`, 14, 26);
      doc.text(`Periodo Facturado: ${splitAgua.startDate} al ${splitAgua.endDate} (${splitAgua.totalDays} días)`, 14, 32);

      let currentY = 50;

      // --- SECTION 1: SUMMARY & DETAILS ---
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("1. Desglose Detallado del Gasto por Apartamento", 14, currentY);
      currentY += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `Importe Total Factura: ${splitAgua.totalAmount.toFixed(2)}€ ${
          billAgua.totalVolume ? `| Volumen Estimado: ${billAgua.totalVolume} m³` : ""
        }`,
        14,
        currentY
      );
      currentY += 7;

      // Table for Water Split (Daily, Monthly, Total)
      const headersAgua = [["Concepto de Reparto", "Apartamento A", "Apartamento B", "Total Factura"]];
      const dataAgua = [
        [
          "TOTAL FACTURA COMPLETA (€)",
          `${splitAgua.totalA.toFixed(2)}€`,
          `${splitAgua.totalB.toFixed(2)}€`,
          `${splitAgua.totalAmount.toFixed(2)}€`
        ],
        [
          "Coste Diario Equivalente (€/día)",
          `${splitAgua.dailyCostA.toFixed(2)}€/día`,
          `${splitAgua.dailyCostB.toFixed(2)}€/día`,
          `${splitAgua.dailyCostTotal.toFixed(2)}€/día`
        ],
        [
          "Coste Mensual Proporcional (€/mes)",
          `${splitAgua.monthlyCostA.toFixed(2)}€/mes`,
          `${splitAgua.monthlyCostB.toFixed(2)}€/mes`,
          `${splitAgua.monthlyCostTotal.toFixed(2)}€/mes`
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        head: headersAgua,
        body: dataAgua,
        theme: "striped",
        headStyles: { fillColor: [13, 148, 136] }, // Teal 600
        styles: { fontSize: 8.5 },
        columnStyles: { 0: { fontStyle: "bold" } }
      });

      currentY = (doc as any).lastAutoTable.finalY + 10;

      // --- METHODOLOGY EXPLANATION BOX ---
      doc.setFillColor(240, 253, 250); // Teal 50
      doc.rect(14, currentY, 182, 38, "F");
      doc.setDrawColor(153, 246, 228); // Teal 200
      doc.rect(14, currentY, 182, 38, "D");

      doc.setTextColor(15, 118, 110);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("METODOLOGÍA Y CRITERIO DE CÁLCULO DE AGUA:", 18, currentY + 6);

      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(
        "1. Reparto Equitativo 50/50: La vivienda cuenta con un contador general de agua, por lo que el importe total se divide en partes iguales.",
        18,
        currentY + 13
      );
      doc.text(
        `2. Cálculo por Día: ${splitAgua.totalA.toFixed(2)}€ por apartamento ÷ ${splitAgua.totalDays} días = ${splitAgua.dailyCostA.toFixed(2)}€/día por apartamento.`,
        18,
        currentY + 19
      );
      doc.text(
        `3. Cálculo por Mes: ${splitAgua.dailyCostA.toFixed(2)}€/día × 30 días = ${splitAgua.monthlyCostA.toFixed(2)}€/mes por apartamento.`,
        18,
        currentY + 25
      );
      doc.text(
        billAgua.totalVolume
          ? `4. Volumen de Agua: ${billAgua.totalVolume} m³ totales (${(billAgua.totalVolume / 2).toFixed(1)} m³ asignados a cada apartamento).`
          : "4. Facturación Trimestral de Suministro y Canon de Agua.",
        18,
        currentY + 31
      );

      currentY += 46;

      // --- SECTION 2: ATTACHED WATER BILL IMAGE ---
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("2. Documento de Factura Oficial de Agua Adjunto", 14, currentY);
      currentY += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(
        "Se adjunta a continuación la copia oficial de la factura para que los inquilinos puedan comprobar el importe total y conceptos:",
        14,
        currentY
      );
      currentY += 6;

      if (billAgua.fileUrl) {
        const imgObj = await getReportImageDataUrl(billAgua.fileUrl);

        if (imgObj) {
          // If not enough height on current page, create a clean new page for the bill image
          if (currentY + 130 > 270) {
            doc.addPage();
            currentY = 20;

            doc.setTextColor(15, 23, 42);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text("Anexo: Copia Completa de la Factura de Agua", 14, currentY);
            currentY += 10;
          }

          // Calculate scaled dimensions to preserve aspect ratio
          const maxW = 180;
          const maxH = 185;
          let w = imgObj.width;
          let h = imgObj.height;

          const ratio = Math.min(maxW / w, maxH / h);
          w = w * ratio;
          h = h * ratio;

          const xPos = (210 - w) / 2; // centered
          doc.setDrawColor(203, 213, 225);
          doc.rect(xPos - 1, currentY - 1, w + 2, h + 2, "D");
          doc.addImage(imgObj.dataUrl, "JPEG", xPos, currentY, w, h);
          currentY += h + 15;
        } else {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, currentY, 182, 18, "F");
          doc.setTextColor(100, 116, 139);
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8.5);
          doc.text("La imagen adjunta a esta factura no pudo renderizarse en el documento PDF.", 18, currentY + 11);
          currentY += 24;
        }
      } else {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, currentY, 182, 18, "F");
        doc.setDrawColor(226, 232, 240);
        doc.rect(14, currentY, 182, 18, "D");

        doc.setTextColor(100, 116, 139);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        doc.text(
          "Nota: Esta factura fue registrada en el sistema sin una imagen o archivo adjunto.",
          18,
          currentY + 11
        );
        currentY += 24;
      }

      // Footer
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Documento oficial generado automáticamente por Dividir Facturas de Piso - Control de Agua.", 14, 285);

      // Save PDF
      doc.save(
        `Reporte_Agua_${property.address.replace(/\s+/g, "_")}_${billAgua.startDate}_al_${billAgua.endDate}.pdf`
      );
    } catch (err) {
      console.error("Error al generar PDF de agua:", err);
    } finally {
      setGenerating(false);
    }
  };

  if (variant === "icon") {
    return (
      <button
        onClick={generatePDF}
        disabled={generating}
        className={`p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition cursor-pointer flex items-center gap-1 font-sans ${className}`}
        title="Descargar Reporte PDF de Agua con Factura"
      >
        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" /> : <FileText className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <button
      onClick={generatePDF}
      disabled={generating}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded border transition cursor-pointer shadow-xs ${
        variant === "emerald"
          ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-250"
      } ${className}`}
    >
      {generating ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
      ) : (
        <Droplet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      )}
      <span>{generating ? "Generando..." : label}</span>
    </button>
  );
}
