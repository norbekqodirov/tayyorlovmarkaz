export interface TransactionCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  isActive: boolean;
  /** TQ-E: kurs to'lovi / boshqa kirim / ... ; null — nomdan avtomatik aniqlanadi */
  kind?: string | null;
  /** IP-23: tizim kategoriyasi kaliti (tuition, payroll, advance, refund, ...) — o'chirilmaydi, turi o'zgarmaydi */
  systemKey?: string | null;
  isSystem?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
}
