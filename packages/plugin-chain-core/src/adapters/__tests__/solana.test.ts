import { Connection, PublicKey } from '@solana/web3.js';
import { SolanaChainAdapter } from '../solana';
import { ChainConfig } from '../../types';

jest.mock('@solana/web3.js');

describe('SolanaChainAdapter', () => {
  const mockConfig: ChainConfig = {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    chainId: 'solana',
    name: 'Solana',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9
    }
  };

  let adapter: SolanaChainAdapter;
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    mockConnection = {
      getVersion: jest.fn(),
      getBlock: jest.fn(),
      getTransaction: jest.fn(),
      getBalance: jest.fn(),
      getProgramAccounts: jest.fn(),
      getSlot: jest.fn(),
      getRecentPerformanceSamples: jest.fn(),
    } as any;

    (Connection as jest.Mock).mockImplementation(() => mockConnection);
    adapter = new SolanaChainAdapter(mockConfig);
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      mockConnection.getVersion.mockResolvedValue('1.9.12');
      
      await expect(adapter.connect()).resolves.not.toThrow();
    });

    it('should throw error if connection fails', async () => {
      mockConnection.getVersion.mockRejectedValue(new Error('Connection failed'));
      
      await expect(adapter.connect()).rejects.toThrow('Failed to connect to Solana node');
    });
  });

  describe('getBlock', () => {
    it('should return block data', async () => {
      const mockBlock = {
        blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
        parentSlot: 123,
        blockTime: Date.now() / 1000,
        transactions: [
          {
            transaction: {
              signatures: ['sig1']
            }
          }
        ]
      };
      mockConnection.getBlock.mockResolvedValue(mockBlock as any);

      const block = await adapter.getBlock(123);
      expect(block).toEqual({
        hash: mockBlock.blockhash,
        number: mockBlock.parentSlot + 1,
        timestamp: mockBlock.blockTime * 1000,
        transactions: mockBlock.transactions.map(tx => tx.transaction.signatures[0])
      });
    });
  });

  describe('getTransaction', () => {
    it('should return transaction data', async () => {
      const mockTx = {
        slot: 123,
        transaction: {
          signatures: ['sig1'],
          message: {
            accountKeys: [
              { pubkey: new PublicKey('from'), signer: true },
              { pubkey: new PublicKey('to'), signer: false }
            ]
          }
        },
        meta: {
          fee: 5000,
          postBalances: [100000000, 200000000],
          preBalances: [100005000, 199995000]
        }
      };
      mockConnection.getTransaction.mockResolvedValue(mockTx as any);

      const tx = await adapter.getTransaction('sig1');
      expect(tx).toEqual({
        hash: mockTx.transaction.signatures[0],
        blockNumber: mockTx.slot,
        from: mockTx.transaction.message.accountKeys[0].pubkey.toString(),
        to: mockTx.transaction.message.accountKeys[1].pubkey.toString(),
        value: '5000'
      });
    });
  });

  describe('getAccount', () => {
    it('should return account data', async () => {
      const address = new PublicKey('address').toString();
      const mockBalance = 1000000000;
      const mockProgramAccounts = [{
        account: {
          data: Buffer.from('test'),
          executable: true
        }
      }];

      mockConnection.getBalance.mockResolvedValue(mockBalance);
      mockConnection.getProgramAccounts.mockResolvedValue(mockProgramAccounts as any);

      const account = await adapter.getAccount(address);
      expect(account).toEqual({
        address,
        balance: mockBalance.toString(),
        code: '0x' + mockProgramAccounts[0].account.data.toString('hex'),
        isContract: mockProgramAccounts[0].account.executable
      });
    });
  });

  describe('getChainState', () => {
    it('should return chain state', async () => {
      const mockSlot = 123;
      const mockPerformance = [{
        numSlots: 100,
        samplePeriodSecs: 60,
        numTransactions: 1000
      }];

      mockConnection.getSlot.mockResolvedValue(mockSlot);
      mockConnection.getRecentPerformanceSamples.mockResolvedValue(mockPerformance as any);

      const state = await adapter.getChainState();
      expect(state).toEqual({
        blockHeight: mockSlot,
        tps: Math.round(mockPerformance[0].numTransactions / mockPerformance[0].samplePeriodSecs),
        chainId: mockConfig.chainId,
        name: mockConfig.name
      });
    });
  });
}); 