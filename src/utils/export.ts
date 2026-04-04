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
