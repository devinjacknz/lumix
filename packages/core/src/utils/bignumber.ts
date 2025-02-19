import { ethers } from 'ethers';

export type BigNumberish = string | number | bigint;

export function toBigInt(value: BigNumberish): bigint {
  return ethers.getBigInt(value);
}

export function formatUnits(value: BigNumberish, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

export function parseUnits(value: string, decimals: number): bigint {
  return ethers.parseUnits(value, decimals);
}

export function formatEther(value: BigNumberish): string {
  return ethers.formatEther(value);
}

export function parseEther(value: string): bigint {
  return ethers.parseEther(value);
}

export function add(a: BigNumberish, b: BigNumberish): bigint {
  return toBigInt(a) + toBigInt(b);
}

export function sub(a: BigNumberish, b: BigNumberish): bigint {
  return toBigInt(a) - toBigInt(b);
}

export function mul(a: BigNumberish, b: BigNumberish): bigint {
  return toBigInt(a) * toBigInt(b);
}

export function div(a: BigNumberish, b: BigNumberish): bigint {
  return toBigInt(a) / toBigInt(b);
}

export function gt(a: BigNumberish, b: BigNumberish): boolean {
  return toBigInt(a) > toBigInt(b);
}

export function gte(a: BigNumberish, b: BigNumberish): boolean {
  return toBigInt(a) >= toBigInt(b);
}

export function lt(a: BigNumberish, b: BigNumberish): boolean {
  return toBigInt(a) < toBigInt(b);
}

export function lte(a: BigNumberish, b: BigNumberish): boolean {
  return toBigInt(a) <= toBigInt(b);
}

export function eq(a: BigNumberish, b: BigNumberish): boolean {
  return toBigInt(a) === toBigInt(b);
}

export function max(a: BigNumberish, b: BigNumberish): bigint {
  const aBigInt = toBigInt(a);
  const bBigInt = toBigInt(b);
  return aBigInt > bBigInt ? aBigInt : bBigInt;
}

export function min(a: BigNumberish, b: BigNumberish): bigint {
  const aBigInt = toBigInt(a);
  const bBigInt = toBigInt(b);
  return aBigInt < bBigInt ? aBigInt : bBigInt;
}

export function isZero(value: BigNumberish): boolean {
  return toBigInt(value) === 0n;
}

export function toString(value: BigNumberish): string {
  return toBigInt(value).toString();
} 