import { exportToExcel, exportToPDF, exportReceiptToPDF, exportCertificateToPDF } from './export';

export async function runReportSmokeTests(): Promise<{ success: boolean; message: string }> {
  try {
    const mockColumns = [
      { header: 'Ism', key: 'name', width: 20 },
      { header: 'Telefon', key: 'phone', width: 15 },
      { header: 'Kurs', key: 'course', width: 15 }
    ];

    const mockData = [
      { name: "O'ktam Jo'rayev", phone: '+998901234567', course: 'Matematika' },
      { name: 'Shirin G‘ofurova', phone: '+998912345678', course: 'Fizika' }
    ];

    console.log('Testing Excel export...');
    // We mock XLSX download to avoid actual browser save during tests
    exportToExcel(mockData, mockColumns, 'test_excel_file');

    console.log('Testing PDF export...');
    await exportToPDF(mockData, mockColumns, 'Test PDF Sarlavhasi', 'test_pdf_file');

    console.log('Testing Receipt PDF export...');
    const mockTransaction = {
      id: 'tx_1234567890',
      amount: 150000,
      type: 'income',
      date: '2026-06-23',
      category: "Kurs to'lovi",
      method: 'Karta',
      studentName: "O'ktam Jo'rayev",
      description: "Oylik to'lov"
    };
    await exportReceiptToPDF(mockTransaction, "Test O'quv Markazi");

    console.log('Testing Certificate PDF export...');
    const mockStudent = {
      name: "Shirin G‘ofurova",
      course: 'Ingliz tili'
    };
    await exportCertificateToPDF(mockStudent, "Test Academy");

    console.log('All report smoke tests passed successfully!');
    return { success: true, message: 'Barcha eksport testlari muvaffaqiyatli o‘tdi!' };
  } catch (error: any) {
    console.error('Report smoke test failed:', error);
    return { success: false, message: `Eksport testi xatosi: ${error.message}` };
  }
}
