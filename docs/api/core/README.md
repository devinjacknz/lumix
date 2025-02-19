# Lumix Core API Documentation

## Overview
The `@lumix/core` package provides the foundation for the Lumix DeFi Agent system. It contains core types, interfaces, and utilities used throughout the system.

## Installation
```bash
pnpm add @lumix/core
```

## Core Components

### Account System
The account system manages different types of entities in the system:

```typescript
enum AccountType {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system'
}

enum AccountStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended'
}

enum AccountPermission {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin'
}

interface Account {
  id: string;
  type: AccountType;
  status: AccountStatus;
  permissions: AccountPermission[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Usage Example
```typescript
import { AccountType, AccountStatus, AccountPermission, type Account } from '@lumix/core';

const userAccount: Account = {
  id: 'user_123',
  type: AccountType.USER,
  status: AccountStatus.ACTIVE,
  permissions: [AccountPermission.READ, AccountPermission.WRITE],
  metadata: {
    name: 'John Doe',
    email: 'john@example.com'
  },
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### Schema Validation
The package includes Zod schemas for runtime type validation:

```typescript
import { AccountSchema, CreateAccountSchema, UpdateAccountSchema } from '@lumix/core';

// Validate complete account
const result = AccountSchema.safeParse(accountData);
if (result.success) {
  // Data is valid
  const account = result.data;
} else {
  // Handle validation errors
  console.error(result.error);
}

// Validate account creation
const createResult = CreateAccountSchema.safeParse(newAccountData);

// Validate account update
const updateResult = UpdateAccountSchema.safeParse(updateData);
```

## Error Handling
The core package provides standardized error types:

```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

class LumixError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}
```

### Error Handling Example
```typescript
import { ErrorCode, LumixError } from '@lumix/core';

try {
  // Some operation
  throw new LumixError(
    ErrorCode.VALIDATION_ERROR,
    'Invalid account data',
    { field: 'email', message: 'Invalid email format' }
  );
} catch (error) {
  if (error instanceof LumixError) {
    // Handle specific error types
    switch (error.code) {
      case ErrorCode.VALIDATION_ERROR:
        // Handle validation error
        break;
      case ErrorCode.AUTHENTICATION_ERROR:
        // Handle authentication error
        break;
      // ...
    }
  }
}
```

## Events System
The core package includes an event system for communication between components:

```typescript
enum EventType {
  ACCOUNT_CREATED = 'account.created',
  ACCOUNT_UPDATED = 'account.updated',
  ACCOUNT_DELETED = 'account.deleted'
}

interface Event<T = any> {
  type: EventType;
  payload: T;
  timestamp: Date;
}
```

### Event Handling Example
```typescript
import { EventType, type Event } from '@lumix/core';

function handleAccountCreated(event: Event<Account>) {
  const { payload: account } = event;
  // Handle new account
}

// Subscribe to events
eventEmitter.on(EventType.ACCOUNT_CREATED, handleAccountCreated);

// Emit events
eventEmitter.emit(EventType.ACCOUNT_CREATED, {
  type: EventType.ACCOUNT_CREATED,
  payload: newAccount,
  timestamp: new Date()
});
```

## Utilities
The core package provides various utility functions:

### Validation Utilities
```typescript
import { isValidAddress, isValidAmount } from '@lumix/core';

// Validate Solana address
if (isValidAddress(address)) {
  // Address is valid
}

// Validate token amount
if (isValidAmount(amount)) {
  // Amount is valid
}
```

### Type Guards
```typescript
import { isAccount, isEvent } from '@lumix/core';

function processData(data: unknown) {
  if (isAccount(data)) {
    // data is typed as Account
    console.log(data.type);
  }

  if (isEvent(data)) {
    // data is typed as Event
    console.log(data.type);
  }
}
```

## Integration with Other Packages
The core package is designed to work seamlessly with other Lumix packages:

```typescript
import { Account } from '@lumix/core';
import { Agent } from '@lumix/agent';
import { HeliusClient } from '@lumix/helius';

async function createAgentAccount(agent: Agent): Promise<Account> {
  const account: Account = {
    id: agent.id,
    type: AccountType.AGENT,
    status: AccountStatus.ACTIVE,
    permissions: [AccountPermission.READ, AccountPermission.WRITE],
    metadata: {
      name: agent.name,
      capabilities: agent.capabilities
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  return account;
}
```

## Best Practices
1. Always use type annotations for better type safety
2. Utilize schema validation for runtime type checking
3. Implement proper error handling using LumixError
4. Use event system for loose coupling between components
5. Leverage utility functions for common operations

## Contributing
See the [Contributing Guide](../../CONTRIBUTING.md) for details on how to contribute to the core package.

## License
MIT License - see the [LICENSE](../../LICENSE) file for details.
