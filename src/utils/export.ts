import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

export function exportToExcel(data: any[], columns: ExportColumn[], filename: string) {
  const wsData = [
    columns.map(c => c.header),
    ...data.map(row => columns.map(c => row[c.key] ?? ''))
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = columns.map(c => ({ wch: c.width || 20 }));

  XLSX.utils.book_append_sheet(wb, ws, 'Ma\'lumotlar');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPDF(data: any[], columns: ExportColumn[], title: string, filename: string) {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(16);
  doc.text(title, 14, 20);

  // Date
  doc.setFontSize(10);
  doc.text(`Sana: ${new Date().toLocaleDateString('uz-UZ')}`, 14, 28);

  // Table
  autoTable(doc, {
    startY: 35,
    head: [columns.map(c => c.header)],
    body: data.map(row => columns.map(c => String(row[c.key] ?? ''))),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Sahifa ${i} / ${pageCount}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 10);
  }

  doc.save(`${filename}.pdf`);
}

export function exportReceiptToPDF(transaction: any, orgName: string = "O'quv Markazi") {
  // Use A5 format for receipts
  const doc = new jsPDF({ format: 'a5' });

  // Receipt Header
  doc.setFillColor(59, 130, 246); // Blue-500
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text("TO'LOV CHEKI", 15, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(orgName, doc.internal.pageSize.getWidth() - 15, 20, { align: 'right' });

  // Receipt Body
  doc.setTextColor(50, 50, 50);
  
  // Amount block
  doc.setFontSize(12);
  doc.text("To'lov summasi:", 15, 50);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  const amountStr = new Intl.NumberFormat('uz-UZ').format(transaction.amount) + " UZS";
  doc.text(transaction.type === 'income' ? `+${amountStr}` : `-${amountStr}`, 15, 62);
  doc.setFont('helvetica', 'normal');

  // Details
  let startY = 85;
  const lineGap = 10;
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  
  const drawRow = (label: string, value: string, yPos: number) => {
    doc.setFont('helvetica', 'normal');
    doc.text(label, 15, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    // Right aligned text handles long values better
    doc.text(value || '-', doc.internal.pageSize.getWidth() - 15, yPos, { align: 'right' });
    doc.setTextColor(100, 100, 100);
    // Draw subtle line
    doc.setDrawColor(240, 240, 240);
    doc.line(15, yPos + 3, doc.internal.pageSize.getWidth() - 15, yPos + 3);
  };

  drawRow("Sana:", transaction.date, startY); startY += lineGap;
  drawRow("ID:", transaction.id ? transaction.id.slice(0, 8).toUpperCase() : 'N/A', startY); startY += lineGap;
  drawRow("Kategoriya:", transaction.category, startY); startY += lineGap;
  drawRow("To'lov usuli:", transaction.method, startY); startY += lineGap;
  
  if (transaction.studentName) {
    drawRow("O'quvchi:", transaction.studentName, startY); startY += lineGap;
  }
  if (transaction.staffName) {
    drawRow("Xodim:", transaction.staffName, startY); startY += lineGap;
  }

  // Description
  doc.setFont('helvetica', 'normal');
  doc.text("Tavsif:", 15, startY + 5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(80, 80, 80);
  
  const splitTitle = doc.splitTextToSize(transaction.description || 'Kiritilmagan', doc.internal.pageSize.getWidth() - 30);
  doc.text(splitTitle, 15, startY + 12);

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("To'lovingiz uchun tashakkur!", doc.internal.pageSize.getWidth() / 2, pageHeight - 15, { align: 'center' });
  
  // Save file
  const fileName = `Chek_${transaction.id || Date.now()}.pdf`;
  doc.save(fileName);
}

export function exportCertificateToPDF(student: any, orgName: string = "DATA TA'LIM MARKAZI") {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  
  // Background
  doc.setFillColor(252, 252, 252);
  doc.rect(0, 0, w, h, 'F');
  
  // Border wrapper
  doc.setDrawColor(218, 165, 32); // Goldenrod
  doc.setLineWidth(4);
  doc.rect(12, 12, w - 24, h - 24);
  doc.setLineWidth(0.5);
  doc.rect(18, 18, w - 36, h - 36);

  // Title
  doc.setTextColor(30, 30, 40);
  doc.setFontSize(45);
  doc.setFont('times', 'bold');
  doc.text("S E R T I F I K A T", w / 2, 60, { align: 'center' });
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 110);
  doc.text("Guvohnoma shuni tasdiqlaydiki,", w / 2, 85, { align: 'center' });
  
  // Student Name
  doc.setFontSize(40);
  doc.setTextColor(37, 99, 235); // Blue-600
  doc.setFont('times', 'italic');
  doc.text((student.name || 'Noma\'lum o\'quvchi').toUpperCase(), w / 2, 115, { align: 'center' });

  // Description
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 70);
  doc.text(`Tashkilotimizning "${student.course || 'Umumiy'}" kursini amaliy va nazariy`, w / 2, 140, { align: 'center' });
  doc.text("jihatdan muvaffaqiyatli tamomlagani uchun taqdirlandi.", w / 2, 152, { align: 'center' });

  // Bottom details
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.setFont('times', 'bold');
  
  doc.text(orgName, 50, h - 40);
  doc.text(new Date().toLocaleDateString('uz-UZ'), w - 50, h - 40, { align: 'right' });
  
  // Lines for signature
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.5);
  doc.line(50, h - 43, 130, h - 43); // Left line
  doc.line(w - 110, h - 43, w - 50, h - 43); // Right line
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text("Boshqaruvchi", 90, h - 35, { align: 'center' });
  doc.text("B.Sana", w - 80, h - 35, { align: 'center' });

  doc.save(`Sertifikat_${(student.name || 'oquvchi').replace(/\s+/g, '_')}.pdf`);
}
