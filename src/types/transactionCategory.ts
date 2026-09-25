export interface TransactionCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  isActive: boolean;
  /** TQ-E: kurs to'lovi / boshqa kirim / ... ; null — nomdan avtomatik aniqlanadi */
  kind?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
