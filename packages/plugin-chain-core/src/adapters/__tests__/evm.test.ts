import { ethers } from 'ethers';
import { EVMChainAdapter } from '../evm';
import { ChainConfig } from '../../types';

// Mock ethers provider
jest.mock('ethers', () => ({
  ethers: {
    providers: {
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getNetwork: jest.fn().mockResolvedValue({ chainId: 1 }),
        getBlock: jest.fn().mockResolvedValue({
          number: 1,
          hash: '0x123',
          timestamp: Date.now(),
          transactions: ['0x456']
        }),
        getTransaction: jest.fn().mockResolvedValue({
          hash: '0x456',
          from: '0x789',
          to: '0xabc',
          value: ethers.BigNumber.from(1000),
          blockNumber: 1
        }),
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          gasUsed: ethers.BigNumber.from(21000),
          effectiveGasPrice: ethers.BigNumber.from(2000000000)
        }),
        getBalance: jest.fn().mockResolvedValue(ethers.BigNumber.from(1000000)),
        getCode: jest.fn().mockResolvedValue('0x'),
        getTransactionCount: jest.fn().mockResolvedValue(5),
        getGasPrice: jest.fn().mockResolvedValue(ethers.BigNumber.from(2000000000)),
        send: jest.fn().mockResolvedValue({ pending: 10 })
      }))
    },
    BigNumber: {
      from: jest.fn().mockImplementation(value => ({ toString: () => value.toString() }))
    },
    utils: {
      parseEther: jest.fn().mockImplementation(value => value),
      parseUnits: jest.fn().mockImplementation((value) => value)
    }
  }
}));

describe('EVMChainAdapter', () => {
  const mockConfig: ChainConfig = {
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR-PROJECT-ID',
    chainId: 1,
    name: 'Ethereum',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18
    }
  };

  let adapter: EVMChainAdapter;
  let mockProvider: jest.Mocked<ethers.JsonRpcProvider>;

  beforeEach(() => {
    mockProvider = {
      getNetwork: jest.fn(),
      getBlock: jest.fn(),
      getTransaction: jest.fn(),
      getBalance: jest.fn(),
      getCode: jest.fn(),
      getBlockNumber: jest.fn(),
      getGasPrice: jest.fn(),
    } as any;

    (ethers.JsonRpcProvider as jest.Mock).mockImplementation(() => mockProvider);
    adapter = new EVMChainAdapter(mockConfig);
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      mockProvider.getNetwork.mockResolvedValue({ chainId: 1 } as any);
      
      await expect(adapter.connect()).resolves.not.toThrow();
    });

    it('should throw error if chainId mismatch', async () => {
      mockProvider.getNetwork.mockResolvedValue({ chainId: 2 } as any);
      
      await expect(adapter.connect()).rejects.toThrow('Chain ID mismatch');
    });
  });

  describe('getBlock', () => {
    it('should return block data', async () => {
      const mockBlock = {
        hash: '0x123',
        number: 123,
        timestamp: Date.now(),
        transactions: ['0x456']
      };
      mockProvider.getBlock.mockResolvedValue(mockBlock as any);

      const block = await adapter.getBlock(123);
      expect(block).toEqual({
        hash: mockBlock.hash,
        number: mockBlock.number,
        timestamp: mockBlock.timestamp,
        transactions: mockBlock.transactions
      });
    });
  });

  describe('getTransaction', () => {
    it('should return transaction data', async () => {
      const mockTx = {
        hash: '0x123',
        blockNumber: 123,
        from: '0x456',
        to: '0x789',
        value: ethers.parseEther('1.0')
      };
      mockProvider.getTransaction.mockResolvedValue(mockTx as any);

      const tx = await adapter.getTransaction('0x123');
      expect(tx).toEqual({
        hash: mockTx.hash,
        blockNumber: mockTx.blockNumber,
        from: mockTx.from,
        to: mockTx.to,
        value: mockTx.value.toString()
      });
    });
  });

  describe('getAccount', () => {
    it('should return account data', async () => {
      const address = '0x123';
      const mockBalance = ethers.parseEther('1.0');
      const mockCode = '0x456';

      mockProvider.getBalance.mockResolvedValue(mockBalance);
      mockProvider.getCode.mockResolvedValue(mockCode);

      const account = await adapter.getAccount(address);
      expect(account).toEqual({
        address,
        balance: mockBalance.toString(),
        code: mockCode,
        isContract: mockCode !== '0x'
      });
    });
  });

  describe('getChainState', () => {
    it('should return chain state', async () => {
      const mockBlockNumber = 123;
      const mockGasPrice = ethers.parseUnits('50', 'gwei');

      mockProvider.getBlockNumber.mockResolvedValue(mockBlockNumber);
      mockProvider.getGasPrice.mockResolvedValue(mockGasPrice);

      const state = await adapter.getChainState();
      expect(state).toEqual({
        blockHeight: mockBlockNumber,
        gasPrice: mockGasPrice.toString(),
        chainId: mockConfig.chainId,
        name: mockConfig.name
      });
    });
  });
}); 