# Lumix API Documentation

## Overview
Welcome to the Lumix API documentation. Lumix is a comprehensive DeFi agent system built on Solana, providing intelligent automation and natural language interaction capabilities for DeFi operations.

## Packages

### [@lumix/core](./core/README.md)
Core package providing fundamental types, interfaces, and utilities:
- Account management system
- Error handling
- Event system
- Validation utilities
- Type definitions

### [@lumix/agent](./agent/README.md)
Intelligent agent system for DeFi operations:
- LangChain integration
- Natural language processing
- DeFi operation tools
- Memory system
- Response handling

### [@lumix/helius](./helius/README.md)
Helius blockchain data integration:
- Real-time blockchain data access
- Transaction monitoring
- WebSocket API
- Token and DeFi APIs
- Rate limiting

## Quick Start

### Installation
```bash
# Install core package
pnpm add @lumix/core

# Install agent package
pnpm add @lumix/agent

# Install Helius integration
pnpm add @lumix/helius
```

### Basic Usage
```typescript
import { DeFiAgent } from '@lumix/agent';
import { HeliusClient } from '@lumix/helius';
import { AccountType } from '@lumix/core';

// Initialize Helius client
const helius = new HeliusClient({
  apiKey: process.env.HELIUS_API_KEY
});

// Create DeFi agent
const agent = new DeFiAgent({
  model: 'gpt-4',
  tools: [
    new BalanceChecker(helius),
    new SwapExecutor(helius)
  ]
});

// Execute DeFi operations
const response = await agent.execute('Check SOL balance');

// Chat interaction
const chat = await agent.chat('What is the current price of SOL?');
```

## Architecture

### System Components
```
Lumix System
├── Core Layer (@lumix/core)
│   ├── Types & Interfaces
│   ├── Error Handling
│   ├── Event System
│   └── Utilities
│
├── Agent Layer (@lumix/agent)
│   ├── LangChain Integration
│   ├── Natural Language Processing
│   ├── DeFi Tools
│   └── Memory System
│
└── Integration Layer (@lumix/helius)
    ├── Blockchain Data Access
    ├── Transaction Monitoring
    ├── WebSocket API
    └── DeFi APIs
```

### Data Flow
1. User input (natural language/commands) → Agent
2. Agent processes input using LangChain
3. Agent selects appropriate tools
4. Tools interact with blockchain via Helius
5. Results are processed and returned to user

## Best Practices

### Configuration
```typescript
// Use environment variables
const config = {
  heliusApiKey: process.env.HELIUS_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY
};

// Configure rate limiting
const helius = new HeliusClient({
  apiKey: config.heliusApiKey,
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000
  }
});

// Configure agent memory
const agent = new DeFiAgent({
  memory: new ConversationMemory({
    maxItems: 100,
    defaultTTL: 3600
  })
});
```

### Error Handling
```typescript
import { LumixError, ErrorCode } from '@lumix/core';

try {
  const result = await agent.execute(command);
} catch (error) {
  if (error instanceof LumixError) {
    switch (error.code) {
      case ErrorCode.VALIDATION_ERROR:
        // Handle validation error
        break;
      case ErrorCode.HELIUS_ERROR:
        // Handle Helius error
        break;
      default:
        // Handle other errors
    }
  }
}
```

### Memory Management
```typescript
// Add context to memory
agent.memory.add({
  key: 'last_operation',
  value: {
    type: 'swap',
    amount: '1 SOL',
    timestamp: new Date()
  }
});

// Use context in operations
const context = agent.memory.get('last_operation');
if (context) {
  // Use context in next operation
}
```

## Contributing
See the [Contributing Guide](../CONTRIBUTING.md) for details on:
- Setting up development environment
- Code style guidelines
- Pull request process
- Testing requirements

## Support
- [Issue Tracker](https://github.com/lumix/lumix/issues)
- [Documentation](https://docs.lumix.io)
- [Community Discord](https://discord.gg/lumix)

## License
MIT License - see the [LICENSE](../LICENSE) file for details.
