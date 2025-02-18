# Contributing to Lumix

We love your input! We want to make contributing to Lumix as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Development Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```
Edit `.env` with your API keys:
```
HELIUS_API_KEY=your_helius_api_key
OPENAI_API_KEY=your_openai_api_key
```

3. Build packages:
```bash
pnpm build
```

4. Run tests:
```bash
pnpm test
```

## Project Structure

```
lumix/
├── packages/
│   ├── core/           # Core types and utilities
│   ├── agent/          # Agent implementation
│   ├── helius/         # Helius integration
│   └── tools/          # DeFi tools
├── docs/               # Documentation
└── tests/              # Integration tests
```

## Code Style

We use ESLint and Prettier to maintain code quality. Our style guide is enforced through these tools:

```bash
# Check style
pnpm lint

# Fix style issues
pnpm lint:fix
```

### TypeScript Guidelines

1. Use strict mode
2. Prefer interfaces over types
3. Document public APIs
4. Use meaningful variable names
5. Keep functions small and focused

Example:
```typescript
/**
 * Represents a DeFi operation result
 */
interface OperationResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  metadata: {
    timestamp: Date;
    duration: number;
  };
}

/**
 * Executes a DeFi operation
 * @param params Operation parameters
 * @returns Operation result
 */
async function executeOperation(params: OperationParams): Promise<OperationResult> {
  // Implementation
}
```

## Testing

We use Jest for testing. Write tests for any new code you create:

```typescript
describe('DeFi Operation', () => {
  it('should execute successfully', async () => {
    const result = await executeOperation({
      type: 'swap',
      amount: '1.0'
    });
    
    expect(result.success).toBe(true);
  });

  it('should handle errors', async () => {
    const result = await executeOperation({
      type: 'invalid'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

Run tests:
```bash
# Run all tests
pnpm test

# Run specific tests
pnpm test packages/core

# Run with coverage
pnpm test:coverage
```

## Documentation

Update documentation for any changes:

1. API documentation in `docs/api/`
2. Update README.md if needed
3. Add examples for new features
4. Update CHANGELOG.md

## Pull Request Process

1. Update the README.md with details of changes to the interface
2. Update the CHANGELOG.md with a note describing your changes
3. The PR will be merged once you have the sign-off of two other developers

## Issue Reporting

### Bug Reports

When filing an issue, make sure to answer these questions:

1. What version of the package are you using?
2. What did you do?
3. What did you expect to see?
4. What did you see instead?

### Feature Requests

When filing a feature request, make sure to:

1. Explain the problem you're trying to solve
2. Explain why this feature would help
3. Describe the solution you'd like to see
4. Be aware of the scope of your request

## Community

Join our Discord community to discuss development:
- [Discord Server](https://discord.gg/lumix)
- [GitHub Discussions](https://github.com/lumix/lumix/discussions)

## License

By contributing, you agree that your contributions will be licensed under its MIT License.

## References

This document was adapted from the open-source contribution guidelines for [Facebook's Draft](https://github.com/facebook/draft-js/blob/master/CONTRIBUTING.md).
