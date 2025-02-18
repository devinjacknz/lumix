declare module '@raydium-io/raydium-sdk' {
  import { PublicKey, Connection } from '@solana/web3.js';
  import { Decimal } from 'decimal.js';
  import BN from 'bn.js';

  export interface PoolKeys {
    id: PublicKey;
    baseToken: PublicKey;
    quoteToken: PublicKey;
    lpToken: PublicKey;
    programId: PublicKey;
  }

  export interface SwapInstructionParams {
    owner: PublicKey;
    inputMint: PublicKey;
    outputMint: PublicKey;
    amount: BN;
    slippage: Decimal;
  }

  export class Market {
    poolKeys: PoolKeys;
    
    makeSwapInstruction(params: SwapInstructionParams): Promise<any>;

    static load(
      connection: Connection,
      address: PublicKey,
      options: Record<string, any>,
      programId: PublicKey
    ): Promise<Market>;
  }

  export class Liquidity {
    static makeAddLiquidityInstruction(params: {
      poolKeys: PoolKeys;
      userKeys: {
        owner: PublicKey;
        baseTokenAccount: PublicKey;
        quoteTokenAccount: PublicKey;
        lpTokenAccount: PublicKey;
      };
      amountIn: {
        tokenA: BN;
        tokenB: BN;
      };
    }): Promise<any>;
  }
}
