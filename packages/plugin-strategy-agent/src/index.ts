import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Market, Liquidity } from '@raydium-io/raydium-sdk';
import BN from 'bn.js';
import { Decimal } from 'decimal.js';
import { 
  StrategyConfig, 
  SwapParams, 
  LiquidityParams,
  StrategyState,
  Position 
} from './types';

export class StrategyAgent {
  private connection: Connection;
  private market!: Market; // Using definite assignment assertion
  private config: StrategyConfig;

  constructor(config: StrategyConfig) {
    this.connection = new Connection(config.rpcUrl);
    this.config = config;
  }

  /**
   * Initialize the strategy agent
   */
  async initialize(): Promise<void> {
    // Load market data
    this.market = await Market.load(
      this.connection,
      new PublicKey(this.config.marketAddress),
      {},
      this.config.programId
    );
  }

  /**
   * Execute a token swap
   */
  async executeSwap(params: SwapParams): Promise<string> {
    const { inputToken, outputToken, amount, slippage } = params;

    // Create swap transaction
    const swapTx = new Transaction();
    
    // Add swap instruction
    const instruction = await this.market.makeSwapInstruction({
      owner: new PublicKey(this.config.walletAddress),
      inputMint: new PublicKey(inputToken),
      outputMint: new PublicKey(outputToken),
      amount: new BN(amount),
      slippage: new Decimal(slippage)
    });

    swapTx.add(instruction);

    // Sign and send transaction
    const signature = await this.connection.sendTransaction(
      swapTx,
      [this.config.wallet]
    );

    return signature;
  }

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(params: LiquidityParams): Promise<string> {
    const { tokenA, tokenB, amountA, amountB } = params;
    const owner = new PublicKey(this.config.walletAddress);

    // Get associated token accounts
    const baseTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(tokenA),
      owner
    );
    const quoteTokenAccount = getAssociatedTokenAddressSync(
      new PublicKey(tokenB),
      owner
    );
    const lpTokenAccount = getAssociatedTokenAddressSync(
      this.market.poolKeys.mintA, // Use mintA as the LP token mint
      owner
    );

    // Create liquidity transaction
    const liquidityTx = new Transaction();

    // Add liquidity instruction
    const instruction = await Liquidity.makeAddLiquidityInstruction({
      poolKeys: this.market.poolKeys,
      userKeys: {
        owner,
        baseTokenAccount,
        quoteTokenAccount,
        lpTokenAccount
      },
      amountIn: {
        tokenA: new BN(amountA),
        tokenB: new BN(amountB)
      }
    });

    liquidityTx.add(instruction);

    // Sign and send transaction
    const signature = await this.connection.sendTransaction(
      liquidityTx,
      [this.config.wallet]
    );

    return signature;
  }

  /**
   * Get current strategy state
   */
  async getState(): Promise<StrategyState> {
    const positions = await this.getPositions();
    
    return {
      positions,
      lastUpdate: new Date().toISOString(),
      marketAddress: this.config.marketAddress
    };
  }

  /**
   * Get current positions
   */
  private async getPositions(): Promise<Position[]> {
    const positions: Position[] = [];
    const owner = new PublicKey(this.config.walletAddress);
    
    // Get token accounts
    const tokenAccounts = await this.connection.getTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID }
    );

    // Map token accounts to positions
    for (const { pubkey, account } of tokenAccounts.value) {
      const accountInfo = await this.connection.getTokenAccountBalance(pubkey);
      
      positions.push({
        token: pubkey.toString(),
        balance: new Decimal(accountInfo.value.amount),
        lastUpdate: new Date().toISOString()
      });
    }

    return positions;
  }
}

export * from './types';
