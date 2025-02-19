import { describe, expect, test } from '@jest/globals';
import * as bignumber from '../bignumber';

describe('BigNumber Utils', () => {
  describe('toBigInt', () => {
    test('converts string to bigint', () => {
      expect(bignumber.toBigInt('123')).toBe(123n);
    });

    test('converts number to bigint', () => {
      expect(bignumber.toBigInt(123)).toBe(123n);
    });

    test('converts bigint to bigint', () => {
      expect(bignumber.toBigInt(123n)).toBe(123n);
    });
  });

  describe('formatUnits and parseUnits', () => {
    test('formats units correctly', () => {
      expect(bignumber.formatUnits('1000000000000000000', 18)).toBe('1.0');
      expect(bignumber.formatUnits('1000000', 6)).toBe('1.0');
    });

    test('parses units correctly', () => {
      expect(bignumber.parseUnits('1.0', 18)).toBe(1000000000000000000n);
      expect(bignumber.parseUnits('1.0', 6)).toBe(1000000n);
    });
  });

  describe('formatEther and parseEther', () => {
    test('formats ether correctly', () => {
      expect(bignumber.formatEther('1000000000000000000')).toBe('1.0');
    });

    test('parses ether correctly', () => {
      expect(bignumber.parseEther('1.0')).toBe(1000000000000000000n);
    });
  });

  describe('Basic Operations', () => {
    test('adds numbers correctly', () => {
      expect(bignumber.add('100', '200')).toBe(300n);
      expect(bignumber.add(100n, 200n)).toBe(300n);
    });

    test('subtracts numbers correctly', () => {
      expect(bignumber.sub('200', '100')).toBe(100n);
      expect(bignumber.sub(200n, 100n)).toBe(100n);
    });

    test('multiplies numbers correctly', () => {
      expect(bignumber.mul('100', '2')).toBe(200n);
      expect(bignumber.mul(100n, 2n)).toBe(200n);
    });

    test('divides numbers correctly', () => {
      expect(bignumber.div('200', '2')).toBe(100n);
      expect(bignumber.div(200n, 2n)).toBe(100n);
    });
  });

  describe('Comparison Operations', () => {
    test('greater than works correctly', () => {
      expect(bignumber.gt('200', '100')).toBe(true);
      expect(bignumber.gt('100', '200')).toBe(false);
    });

    test('greater than or equal works correctly', () => {
      expect(bignumber.gte('200', '100')).toBe(true);
      expect(bignumber.gte('200', '200')).toBe(true);
      expect(bignumber.gte('100', '200')).toBe(false);
    });

    test('less than works correctly', () => {
      expect(bignumber.lt('100', '200')).toBe(true);
      expect(bignumber.lt('200', '100')).toBe(false);
    });

    test('less than or equal works correctly', () => {
      expect(bignumber.lte('100', '200')).toBe(true);
      expect(bignumber.lte('200', '200')).toBe(true);
      expect(bignumber.lte('200', '100')).toBe(false);
    });

    test('equality works correctly', () => {
      expect(bignumber.eq('200', '200')).toBe(true);
      expect(bignumber.eq('100', '200')).toBe(false);
    });
  });

  describe('Min/Max Operations', () => {
    test('max returns larger number', () => {
      expect(bignumber.max('200', '100')).toBe(200n);
      expect(bignumber.max('100', '200')).toBe(200n);
    });

    test('min returns smaller number', () => {
      expect(bignumber.min('200', '100')).toBe(100n);
      expect(bignumber.min('100', '200')).toBe(100n);
    });
  });

  describe('Utility Functions', () => {
    test('isZero works correctly', () => {
      expect(bignumber.isZero('0')).toBe(true);
      expect(bignumber.isZero('1')).toBe(false);
    });

    test('toString works correctly', () => {
      expect(bignumber.toString('123')).toBe('123');
      expect(bignumber.toString(123n)).toBe('123');
    });
  });

  describe('Error Cases', () => {
    test('handles division by zero', () => {
      expect(() => bignumber.div('100', '0')).toThrow();
    });

    test('handles invalid number strings', () => {
      expect(() => bignumber.toBigInt('invalid')).toThrow();
    });
  });
}); 