import { SolanaAnalyzer } from '../analyzer';
import { ChainAdapter, ChainProtocol } from '@lumix/plugin-chain-adapter';
import { Connection, PublicKey } from '@solana/web3.js';

// Mock ChainAdapter
const mockAdapter: ChainAdapter = {
  protocol: ChainProtocol.SOLANA,
  chainId: 1,
  getBalance: jest.fn(),
  getTransaction: jest.fn(),
  callContract: jest.fn(),
  estimateGas: jest.fn(),
  sendTransaction: jest.fn(),
  waitForTransaction: jest.fn(),
  getBlockNumber: jest.fn(),
  getCode: jest.fn()
};

// Mock Connection
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getAccountInfo: jest.fn().mockResolvedValue({
      data: Buffer.alloc(512 * 1024), // 512KB
      owner: {
        equals: jest.fn().mockReturnValue(true),
        toBase58: jest.fn().mockReturnValue('BPFLoaderUpgradeab1e11111111111111111111111')
      }
    }),
    getSignaturesForAddress: jest.fn().mockResolvedValue([
      {
        signature: 'sig1',
        slot: 100,
        blockTime: Date.now() / 1000 - 3600 // 1小时前
      },
      {
        signature: 'sig2',
        slot: 101,
        blockTime: Date.now() / 1000 - 1800 // 30分钟前
      }
    ]),
    getParsedTransaction: jest.fn().mockResolvedValue({
      meta: {
        err: null,
        computeUnitsConsumed: 100000
      },
      transaction: {
        message: {
          instructions: [
            {
              programId: {
                equals: jest.fn().mockReturnValue(true)
              },
              data: Buffer.from('instruction1')
            }
          ]
        }
      }
    }),
    getRecentPerformanceSamples: jest.fn().mockResolvedValue([
      {
        numTransactions: 1000,
        numSlots: 10,
        samplePeriodSecs: 60
      }
    ]),
    getEpochInfo: jest.fn().mockResolvedValue({
      absoluteSlot: 1000000
    }),
    getVoteAccounts: jest.fn().mockResolvedValue({
      current: Array(100).fill({}),
      delinquent: Array(5).fill({})
    })
  })),
  PublicKey: jest.fn().mockImplementation((value) => ({
    equals: jest.fn().mockReturnValue(true),
    toBase58: jest.fn().mockReturnValue(value)
  }))
}));

describe('SolanaAnalyzer', () => {
  let analyzer: SolanaAnalyzer;

  beforeEach(() => {
    analyzer = new SolanaAnalyzer(mockAdapter);
  });

  describe('analyzeContract', () => {
    it('should analyze contract successfully', async () => {
      const result = await analyzer.analyzeContract('test-program');
      
      expect(result.riskLevel).toBe('LOW');
      expect(result.findings).toHaveLength(0);
      expect(result.recommendations).toHaveLength(0);
    });

    it('should handle program not found error', async () => {
      const connection = new Connection('');
      jest.spyOn(connection, 'getAccountInfo').mockResolvedValueOnce(null);

      await expect(analyzer.analyzeContract('non-existent'))
        .rejects
        .toThrow('Program not found');
    });
  });

  describe('getDetailedAnalysis', () => {
    it('should return detailed analysis with metrics', async () => {
      const result = await analyzer.getDetailedAnalysis('test-program');

      expect(result.contractAnalysis).toBeDefined();
      expect(result.interactionHistory).toBeDefined();
      expect(result.programMetrics).toBeDefined();
      expect(result.networkMetrics).toBeDefined();
    });

    it('should use cache for repeated requests', async () => {
      const firstResult = await analyzer.getDetailedAnalysis('test-program');
      const secondResult = await analyzer.getDetailedAnalysis('test-program');

      expect(secondResult).toEqual(firstResult);
    });
  });

  describe('cache management', () => {
    it('should cleanup expired cache entries', () => {
      analyzer.cleanup();
      const stats = analyzer.getCacheStats();
      
      expect(stats.expiredEntries).toBe(0);
    });
  });
}); 