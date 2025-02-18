import axios from 'axios';
import { PythSource } from '../pyth';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('PythSource', () => {
  let source: PythSource;

  beforeEach(() => {
    source = new PythSource();
  });

  describe('getPriceData', () => {
    it('should return price data for supported pair', async () => {
      const mockResponse = {
        data: {
          price: '1000.50',
          timestamp: Date.now()
        }
      };

      mockAxios.get.mockResolvedValue(mockResponse);

      const priceData = await source.getPriceData('BTC/USD');
      
      expect(priceData).toEqual({
        price: 1000.50,
        timestamp: mockResponse.data.timestamp,
        source: 'pyth',
        pair: 'BTC/USD',
        confidence: 0.95
      });
    });

    it('should throw error for unsupported pair', async () => {
      await expect(source.getPriceData('UNKNOWN/USD'))
        .rejects
        .toThrow('Pair UNKNOWN/USD not supported by Pyth');
    });

    it('should throw error on API failure', async () => {
      mockAxios.get.mockRejectedValue(new Error('API error'));

      await expect(source.getPriceData('BTC/USD'))
        .rejects
        .toThrow('Failed to fetch price from Pyth: API error');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported pairs', () => {
      expect(source.isSupported('BTC/USD')).toBe(true);
      expect(source.isSupported('ETH/USD')).toBe(true);
      expect(source.isSupported('SOL/USD')).toBe(true);
    });

    it('should return false for unsupported pairs', () => {
      expect(source.isSupported('UNKNOWN/USD')).toBe(false);
    });
  });

  describe('getConfidence', () => {
    it('should return fixed confidence value', () => {
      expect(source.getConfidence()).toBe(0.95);
    });
  });

  describe('supportedPairs initialization', () => {
    it('should initialize with default supported pairs', () => {
      const source = new PythSource();
      expect(source.isSupported('BTC/USD')).toBe(true);
      expect(source.isSupported('ETH/USD')).toBe(true);
      expect(source.isSupported('SOL/USD')).toBe(true);
    });
  });
}); 