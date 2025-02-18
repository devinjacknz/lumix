# Knowledge Types Documentation

## Overview
The Knowledge system provides a robust framework for managing and retrieving information using RAG (Retrieval Augmented Generation) techniques.

## Core Types

### KnowledgeResult<T>
Represents the result of a knowledge operation.

```typescript
interface KnowledgeResult<T> {
  success: boolean;
  data?: T;
  error?: BaseError;
}
```

### KnowledgeItem
Represents a single piece of knowledge in the system.

```typescript
interface KnowledgeItem {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
}
```

### RAGConfig
Configuration options for RAG-based knowledge management.

```typescript
interface RAGConfig {
  llm?: ModelInstance;
  embedModel?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  similarityThreshold?: number;
  maxSourceDocs?: number;
}
```

### RAGGenerationResult
Result of a RAG-based text generation.

```typescript
interface RAGGenerationResult {
  answer: string;
  sources: KnowledgeRetrievalResult[];
  metadata: {
    totalTokens: number;
    generationTime: number;
  };
}
```

## Usage Examples

### Basic Knowledge Retrieval
```typescript
const manager = new RAGKnowledgeManager({
  rag: {
    embedModel: "text-embedding-ada-002",
    maxTokens: 500,
    temperature: 0.7
  }
});

const result = await manager.generate(
  "What is the current gas price on Solana?",
  { maxSourceDocs: 3 }
);

if (result.success) {
  console.log(result.data.answer);
  console.log("Sources:", result.data.sources);
} else {
  console.error(result.error);
}
```

### Secure Knowledge Management
```typescript
const secureManager = new SecureRAGKnowledgeManager({
  rag: {
    embedModel: "text-embedding-ada-002",
    maxTokens: 500
  },
  security: {
    maxQueryLength: 1000,
    maxChunkSize: 2000,
    allowedEmbedModels: ["text-embedding-ada-002"],
    blockedKeywords: ["private", "secret"]
  }
});

// Will throw RAGError if query contains blocked keywords
const result = await secureManager.generate(
  "What is the current market price?",
  { maxSourceDocs: 3 }
);
```

## Error Handling
The Knowledge system uses a hierarchical error system:

- `BaseError`: Base error class for all errors
- `RAGError`: Specific error class for RAG-related operations

Example error handling:
```typescript
try {
  const result = await manager.generate("query");
  if (!result.success) {
    if (result.error instanceof RAGError) {
      // Handle RAG-specific error
    } else {
      // Handle general error
    }
  }
} catch (error) {
  // Handle unexpected errors
}
```

## Best Practices

1. Always check the `success` flag in `KnowledgeResult`
2. Use appropriate error handling for different error types
3. Configure `maxTokens` and `temperature` based on your use case
4. Use `SecureRAGKnowledgeManager` when dealing with sensitive data
5. Set appropriate `similarityThreshold` for source document retrieval

## Related Components

- `BaseKnowledgeManager`: Base class for all knowledge managers
- `RAGKnowledgeManager`: Implementation of RAG-based knowledge management
- `SecureRAGKnowledgeManager`: Secure version with additional safety checks
