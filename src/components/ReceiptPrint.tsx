import { Printer } from 'lucide-react';

interface Transaction {
  id: string;
  amount: number;
  method: string;
  paidAt?: string;
  createdAt?: string;
  notes?: string;
  student?: { name?: string; phone?: string };
  group?: { name?: string; course?: { name?: string } };
  discountAmount?: number;
}

interface Props {
  transaction: Transaction;
  centerName?: string;
}

export function printReceipt(transaction: Transaction, centerName = 'Tayyorlov Markaz') {
  const date = new Date(transaction.paidAt || transaction.createdAt || new Date()).toLocaleString('uz-UZ');
  const receiptHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Chek #${transaction.id?.slice(-8).toUpperCase()}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; font-family: 'Courier New', monospace; }
        body { margin: 0; padding: 8px; width: 80mm; font-size: 12px; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .large { font-size: 16px; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; }
        .label { color: #555; }
        .amount { font-size: 18px; font-weight: bold; text-align: center; margin: 8px 0; }
        .footer { font-size: 10px; color: #777; text-align: center; margin-top: 8px; }
        .serial { font-size: 10px; text-align: center; color: #999; }
      </style>
    </head>
    <body>
      <div class="center bold large">${centerName}</div>
      <div class="center" style="font-size:10px; color:#777;">To'lov Cheki</div>
      <div class="divider"></div>

      <div class="row">
        <span class="label">Sana:</span>
        <span>${date}</span>
      </div>
      ${transaction.student?.name ? `
      <div class="row">
        <span class="label">O'quvchi:</span>
        <span>${transaction.student.name}</span>
      </div>` : ''}
      ${transaction.student?.phone ? `
      <div class="row">
        <span class="label">Telefon:</span>
        <span>${transaction.student.phone}</span>
      </div>` : ''}
      ${transaction.group?.name ? `
      <div class="row">
        <span class="label">Guruh:</span>
        <span>${transaction.group.name}</span>
      </div>` : ''}
      ${transaction.group?.course?.name ? `
      <div class="row">
        <span class="label">Kurs:</span>
        <span>${transaction.group.course.name}</span>
      </div>` : ''}

      <div class="divider"></div>

      <div class="row">
        <span class="label">To'lov usuli:</span>
        <span class="bold">${transaction.method || 'Naqd'}</span>
      </div>
      ${(transaction.discountAmount || 0) > 0 ? `
      <div class="row">
        <span class="label">Chegirma:</span>
        <span>-${(transaction.discountAmount || 0).toLocaleString()} so'm</span>
      </div>` : ''}

      <div class="divider"></div>
      <div class="amount">${transaction.amount.toLocaleString()} so'm</div>
      <div class="divider"></div>

      ${transaction.notes ? `<div style="font-size:11px; margin: 4px 0; color:#555;">${transaction.notes}</div>` : ''}

      <div class="footer">Rahmat! Kelgusida ham kutamiz.</div>
      <div class="serial">#${transaction.id?.slice(-12).toUpperCase()}</div>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=350,height=600');
  if (!win) return;
  win.document.write(receiptHtml);
  win.document.close();
  win.onload = () => {
    win.print();
    setTimeout(() => win.close(), 1000);
  };
}

export default function ReceiptPrint({ transaction, centerName }: Props) {
  return (
    <button
      onClick={() => printReceipt(transaction, centerName)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
      title="Chek chop etish"
    >
      <Printer size={13} /> Chek
    </button>
  );
}
