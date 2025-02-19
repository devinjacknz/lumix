import { z } from 'zod';
import { 
  ChainProtocol,
  Transaction,
  ChainConfig
} from '../chain';

describe('Chain Types', () => {
  describe('ChainProtocol Enum', () => {
    const ChainProtocolSchema = z.nativeEnum(ChainProtocol);

    it('validates EVM protocol', () => {
      const protocol = ChainProtocol.EVM;
      const result = ChainProtocolSchema.safeParse(protocol);
      expect(result.success).toBe(true);
      expect(protocol).toBe('evm');
    });

    it('validates SOLANA protocol', () => {
      const protocol = ChainProtocol.SOLANA;
      const result = ChainProtocolSchema.safeParse(protocol);
      expect(result.success).toBe(true);
      expect(protocol).toBe('solana');
    });

    it('fails on invalid protocol', () => {
      const result = ChainProtocolSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('Transaction Interface', () => {
    const TransactionSchema = z.object({
      hash: z.string(),
      from: z.string(),
      to: z.string(),
      value: z.bigint().optional(),
      data: z.string().optional(),
      gasPrice: z.bigint().optional(),
      gasLimit: z.bigint().optional(),
      maxPriorityFeePerGas: z.bigint().optional(),
      maxFeePerGas: z.bigint().optional(),
      timestamp: z.number().optional(),
      status: z.enum(['pending', 'confirmed', 'failed']).optional()
    });

    it('validates minimal transaction', () => {
      const tx: Transaction = {
        hash: '0x123',
        from: '0xabc',
        to: '0xdef'
      };
      
      const result = TransactionSchema.safeParse(tx);
      expect(result.success).toBe(true);
    });

    it('validates complete transaction', () => {
      const tx: Transaction = {
        hash: '0x123',
        from: '0xabc',
        to: '0xdef',
        value: BigInt(1000),
        data: '0x0',
        gasPrice: BigInt(20000000000),
        gasLimit: BigInt(21000),
        maxPriorityFeePerGas: BigInt(1000000000),
        maxFeePerGas: BigInt(30000000000),
        timestamp: Date.now(),
        status: 'confirmed'
      };
      
      const result = TransactionSchema.safeParse(tx);
      expect(result.success).toBe(true);
    });

    it('fails when required fields are missing', () => {
      const tx = {
        hash: '0x123',
        from: '0xabc'
      };
      
      const result = TransactionSchema.safeParse(tx);
      expect(result.success).toBe(false);
    });

    it('fails with invalid status', () => {
      const tx = {
        hash: '0x123',
        from: '0xabc',
        to: '0xdef',
        status: 'invalid'
      };
      
      const result = TransactionSchema.safeParse(tx);
      expect(result.success).toBe(false);
    });

    it('validates different transaction status values', () => {
      const statuses: Array<Transaction['status']> = ['pending', 'confirmed', 'failed'];
      
      statuses.forEach(status => {
        const tx: Transaction = {
          hash: '0x123',
          from: '0xabc',
          to: '0xdef',
          status
        };
        
        const result = TransactionSchema.safeParse(tx);
        expect(result.success).toBe(true);
      });
    });

    it('validates transaction with zero values', () => {
      const tx: Transaction = {
        hash: '0x123',
        from: '0xabc',
        to: '0xdef',
        value: BigInt(0),
        gasPrice: BigInt(0),
        gasLimit: BigInt(0)
      };
      
      const result = TransactionSchema.safeParse(tx);
      expect(result.success).toBe(true);
    });

    it('validates transaction with very large values', () => {
      const tx: Transaction = {
        hash: '0x123',
        from: '0xabc',
        to: '0xdef',
        value: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'), // max uint256
        gasPrice: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935'),
        gasLimit: BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
      };
      
      const result = TransactionSchema.safeParse(tx);
      expect(result.success).toBe(true);
    });
  });

  describe('ChainConfig Interface', () => {
    const ChainConfigSchema = z.object({
      rpcUrl: z.string(),
      chainId: z.number(),
      protocol: z.nativeEnum(ChainProtocol),
      confirmationBlocks: z.number(),
      gasMultiplier: z.number(),
      maxGasPrice: z.bigint(),
      retryAttempts: z.number(),
      retryDelay: z.number()
    });

    it('validates valid chain config', () => {
      const config: ChainConfig = {
        rpcUrl: 'https://example.com',
        chainId: 1,
        protocol: ChainProtocol.EVM,
        confirmationBlocks: 12,
        gasMultiplier: 1.1,
        maxGasPrice: BigInt(100000000000),
        retryAttempts: 3,
        retryDelay: 1000
      };
      
      const result = ChainConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('validates chain config with minimum values', () => {
      const config: ChainConfig = {
        rpcUrl: 'https://example.com',
        chainId: 1,
        protocol: ChainProtocol.SOLANA,
        confirmationBlocks: 1,
        gasMultiplier: 1.0,
        maxGasPrice: BigInt(0),
        retryAttempts: 0,
        retryDelay: 0
      };
      
      const result = ChainConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('fails when required fields are missing', () => {
      const config = {
        rpcUrl: 'https://example.com',
        chainId: 1,
        protocol: ChainProtocol.EVM
      };
      
      const result = ChainConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('fails with invalid protocol', () => {
      const config = {
        rpcUrl: 'https://example.com',
        chainId: 1,
        protocol: 'invalid',
        confirmationBlocks: 12,
        gasMultiplier: 1.1,
        maxGasPrice: BigInt(100000000000),
        retryAttempts: 3,
        retryDelay: 1000
      };
      
      const result = ChainConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('fails with invalid numeric values', () => {
      const config = {
        rpcUrl: 'https://example.com',
        chainId: 'invalid',
        protocol: ChainProtocol.EVM,
        confirmationBlocks: 12,
        gasMultiplier: 1.1,
        maxGasPrice: BigInt(100000000000),
        retryAttempts: 3,
        retryDelay: 1000
      };
      
      const result = ChainConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('validates chain config with decimal gas multiplier', () => {
      const config: ChainConfig = {
        rpcUrl: 'https://example.com',
        chainId: 1,
        protocol: ChainProtocol.EVM,
        confirmationBlocks: 12,
        gasMultiplier: 1.5123456789,
        maxGasPrice: BigInt(100000000000),
        retryAttempts: 3,
        retryDelay: 1000
      };
      
      const result = ChainConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('validates chain config with various RPC URL formats', () => {
      const urls = [
        'http://localhost:8545',
        'https://mainnet.infura.io/v3/YOUR-PROJECT-ID',
        'wss://example.com/ws',
        'ipc:/some/local/path',
        'http://192.168.1.1:8545'
      ];

      urls.forEach(rpcUrl => {
        const config: ChainConfig = {
          rpcUrl,
          chainId: 1,
          protocol: ChainProtocol.EVM,
          confirmationBlocks: 12,
          gasMultiplier: 1.1,
          maxGasPrice: BigInt(100000000000),
          retryAttempts: 3,
          retryDelay: 1000
        };
        
        const result = ChainConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });
    });

    it('fails with negative numeric values', () => {
      const configs = [
        { field: 'chainId', value: -1 },
        { field: 'confirmationBlocks', value: -12 },
        { field: 'gasMultiplier', value: -1.1 },
        { field: 'retryAttempts', value: -3 },
        { field: 'retryDelay', value: -1000 }
      ];

      configs.forEach(({ field, value }) => {
        const config: any = {
          rpcUrl: 'https://example.com',
          chainId: 1,
          protocol: ChainProtocol.EVM,
          confirmationBlocks: 12,
          gasMultiplier: 1.1,
          maxGasPrice: BigInt(100000000000),
          retryAttempts: 3,
          retryDelay: 1000,
          [field]: value
        };
        
        const result = ChainConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      });
    });
  });
}); 