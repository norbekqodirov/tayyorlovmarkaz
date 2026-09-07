export interface TransactionCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
