import { ChainType } from '../chain/types';

export interface KeyManager {
  getPrivateKey(chain?: ChainType): string;
  setPrivateKey(privateKey: string, chain?: ChainType): void;
  hasPrivateKey(chain?: ChainType): boolean;
  removePrivateKey(chain?: ChainType): void;
}

class InMemoryKeyManager implements KeyManager {
  private keys: Map<ChainType | 'default', string> = new Map();

  getPrivateKey(chain?: ChainType): string {
    const key = chain ? this.keys.get(chain) : this.keys.get('default');
    if (!key) {
      throw new Error(`No private key found for chain ${chain || 'default'}`);
    }
    return key;
  }

  setPrivateKey(privateKey: string, chain?: ChainType): void {
    this.keys.set(chain || 'default', privateKey);
  }

  hasPrivateKey(chain?: ChainType): boolean {
    return this.keys.has(chain || 'default');
  }

  removePrivateKey(chain?: ChainType): void {
    this.keys.delete(chain || 'default');
  }
}

export const keyManager: KeyManager = new InMemoryKeyManager(); 