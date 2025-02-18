import axios from 'axios';
import { DexScreenerSource } from '../dexscreener';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('DexScreenerSource', () => {
  let source: DexScreenerSource;

  beforeEach(() => {
    source = new DexScreenerSource();
  });

  describe('getPriceData', () => {
    it('should return price data for valid pair', async () => {
      const mockResponse = {
        data: {
          pair: {
            priceUsd: '1000.50',
            volume: {
              h24: '1000000'
            }
          }
        }
      };

      mockAxios.get.mockResolvedValue(mockResponse);

      const priceData = await source.getPriceData('ETH/USD');
      
      expect(priceData).toEqual({
        price: 1000.50,
        timestamp: expect.any(Number),
        source: 'dexscreener',
        pair: 'ETH/USD',
        confidence: 0.9,
        volume24h: 1000000
      });
    });

    it('should throw error when no data found', async () => {
      mockAxios.get.mockResolvedValue({ data: { pair: null } });

      await expect(source.getPriceData('UNKNOWN/USD'))
        .rejects
        .toThrow('No data found for pair UNKNOWN/USD');
    });

    it('should throw error on API failure', async () => {
      mockAxios.get.mockRejectedValue(new Error('API error'));

      await expect(source.getPriceData('ETH/USD'))
        .rejects
        .toThrow('Failed to fetch price from DexScreener: API error');
    });
  });

  describe('isSupported', () => {
    it('should return true for any pair', () => {
      expect(source.isSupported('ETH/USD')).toBe(true);
      expect(source.isSupported('BTC/USD')).toBe(true);
      expect(source.isSupported('UNKNOWN/USD')).toBe(true);
    });
  });

  describe('getConfidence', () => {
    it('should return fixed confidence value', () => {
      expect(source.getConfidence()).toBe(0.9);
    });
  });
}); 