#!/usr/bin/env node
import { Command } from 'commander';
import { config } from 'dotenv';
import inquirer from 'inquirer';
import { LumixAgent } from '@lumix/agent';
import { createHeliusClient } from '@lumix/helius';
import { TokenBalanceTool, SwapTool, MonitorTool, AnalysisTool } from '@lumix/tools';

// Load environment variables
config();

const program = new Command();

// Configuration validation
function validateConfig() {
  const requiredEnvVars = ['HELIUS_API_KEY', 'OPENAI_API_KEY'];
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Error: Missing required environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    process.exit(1);
  }
}

// Error handling wrapper
async function handleCommand(callback: () => Promise<void>) {
  try {
    await callback();
  } catch (error) {
    if (error instanceof Error) {
      console.error('\nError Details:');
      console.error(`Type: ${error.name}`);
      console.error(`Message: ${error.message}`);
      if ('cause' in error) {
        console.error(`Cause: ${error.cause}`);
      }
    } else {
      console.error('\nAn unknown error occurred');
    }
    process.exit(1);
  }
}

// Initialize services
function initializeServices() {
  const helius = createHeliusClient({
    apiKey: process.env.HELIUS_API_KEY || ''
  });

  const agent = new LumixAgent({
    apiKey: process.env.OPENAI_API_KEY || ''
  });

  return { helius, agent };
}

program
  .name('lumix')
  .description('Lumix DeFi Agent CLI')
  .version('0.1.0');

// Balance command
program
  .command('balance <address>')
  .description('Get token balance for a wallet address')
  .option('-t, --token <mint>', 'Token mint address (optional, defaults to SOL)')
  .action(async (address, options) => {
    await handleCommand(async () => {
      validateConfig();
      const { helius, agent } = initializeServices();
      
      await agent.registerTools([
        new TokenBalanceTool(helius)
      ]);

      const result = await agent.chat(
        `What is the ${options.token ? options.token : 'SOL'} balance for ${address}?`
      );

      console.log(result);
    });
  });

// Swap command
program
  .command('swap')
  .description('Execute a token swap')
  .option('-i, --input-token <mint>', 'Input token mint address')
  .option('-o, --output-token <mint>', 'Output token mint address')
  .option('-a, --amount <amount>', 'Amount to swap')
  .option('-s, --slippage <percentage>', 'Slippage tolerance percentage')
  .action(async (options) => {
    await handleCommand(async () => {
      validateConfig();
      const { helius, agent } = initializeServices();
      
      await agent.registerTools([
        new SwapTool(helius)
      ]);

      const result = await agent.chat(
        `Swap ${options.amount} ${options.inputToken} to ${options.outputToken} with ${options.slippage}% slippage`
      );

      console.log(result);
    });
  });

// Monitor command
program
  .command('monitor')
  .description('Monitor transactions or token prices')
  .option('-t, --type <type>', 'Type of monitoring (tx/price)')
  .option('-a, --address <address>', 'Address to monitor (for tx)')
  .option('-t, --token <mint>', 'Token to monitor (for price)')
  .action(async (options) => {
    await handleCommand(async () => {
      validateConfig();
      const { helius, agent } = initializeServices();
      
      await agent.registerTools([
        new MonitorTool(helius)
      ]);

      const result = await agent.chat(
        `Monitor ${options.type === 'tx' ? `transactions for ${options.address}` : `price for ${options.token}`}`
      );

      console.log(result);
    });
  });

// Analysis command
program
  .command('analyze')
  .description('Analyze DeFi data')
  .option('-t, --type <type>', 'Type of analysis (pool/token/protocol)')
  .option('-a, --address <address>', 'Address to analyze')
  .action(async (options) => {
    await handleCommand(async () => {
      validateConfig();
      const { helius, agent } = initializeServices();
      
      await agent.registerTools([
        new AnalysisTool(helius)
      ]);

      const result = await agent.chat(
        `Analyze ${options.type} for ${options.address}`
      );

      console.log(result);
    });
  });

// Interactive mode
program
  .command('interactive')
  .description('Start interactive chat mode')
  .action(async () => {
    await handleCommand(async () => {
      validateConfig();
      const { helius, agent } = initializeServices();
      
      // Register all tools for interactive mode
      await agent.registerTools([
        new TokenBalanceTool(helius),
        new SwapTool(helius),
        new MonitorTool(helius),
        new AnalysisTool(helius)
      ]);

      console.log('\nWelcome to Lumix Interactive Mode!');
      console.log('Type "exit" to quit\n');

      while (true) {
        const { input } = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: 'What would you like to do?'
        }]);

        if (input.toLowerCase() === 'exit') {
          break;
        }

        const result = await agent.chat(input);
        console.log('\nResponse:', result, '\n');
      }
    });
  });

program.parse();
