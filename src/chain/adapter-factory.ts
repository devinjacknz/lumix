import { ChainAdapter, ChainType } from './types';

class ChainAdapterFactory {
  private adapters: Map<ChainType, ChainAdapter> = new Map();

  registerAdapter(chain: ChainType, adapter: ChainAdapter): void {
    this.adapters.set(chain, adapter);
  }

  getAdapter(chain: ChainType): ChainAdapter {
    const adapter = this.adapters.get(chain);
    if (!adapter) {
      throw new Error(`No adapter registered for chain ${chain}`);
    }
    return adapter;
  }

  hasAdapter(chain: ChainType): boolean {
    return this.adapters.has(chain);
  }

  removeAdapter(chain: ChainType): void {
    this.adapters.delete(chain);
  }

  validateAddress(chain: ChainType, address: string): boolean {
    const adapter = this.getAdapter(chain);
    return adapter.validateAddress(address);
  }
}

export const chainAdapterFactory = new ChainAdapterFactory(); 