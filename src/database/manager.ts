import { TransactionRecord } from '../transaction/types';

export interface DatabaseAdapter {
  saveTransaction(transaction: TransactionRecord): Promise<void>;
  getTransaction(id: string): Promise<TransactionRecord | null>;
  listTransactions(filter?: Record<string, any>): Promise<TransactionRecord[]>;
  deleteTransaction(id: string): Promise<void>;
}

class InMemoryDatabaseAdapter implements DatabaseAdapter {
  private transactions: Map<string, TransactionRecord> = new Map();

  async saveTransaction(transaction: TransactionRecord): Promise<void> {
    this.transactions.set(transaction.id, transaction);
  }

  async getTransaction(id: string): Promise<TransactionRecord | null> {
    return this.transactions.get(id) || null;
  }

  async listTransactions(filter?: Record<string, any>): Promise<TransactionRecord[]> {
    const transactions = Array.from(this.transactions.values());
    if (!filter) {
      return transactions;
    }

    return transactions.filter(tx => {
      return Object.entries(filter).every(([key, value]) => {
        return tx[key as keyof TransactionRecord] === value;
      });
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    this.transactions.delete(id);
  }
}

export const databaseManager = {
  getAdapter(): DatabaseAdapter {
    return new InMemoryDatabaseAdapter();
  }
}; 