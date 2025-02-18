# Error Codes Documentation

## Overview
The Lumix error handling system provides a structured way to handle and report errors across different components of the system.

## Error Classes

### BaseError
Base error class for all Lumix errors.

```typescript
class BaseError extends Error {
  code: string;
  details?: Record<string, any>;
}
```

### RAGError
Specific error class for RAG-related operations.

```typescript
class RAGError extends BaseError {
  // Inherits from BaseError with RAG-specific error codes
}
```

## Error Codes

### General Error Codes (1000-1999)
- `1000`: Generic Error
  - Description: A general error occurred
  - Usage: When no specific error code applies

- `1001`: Configuration Error
  - Description: Invalid or missing configuration
  - Usage: When configuration parameters are invalid or missing

- `1002`: Validation Error
  - Description: Input validation failed
  - Usage: When input parameters fail validation checks

- `1003`: Network Error
  - Description: Network-related issues
  - Usage: When API calls or network requests fail

- `1004`: Authentication Error
  - Description: Authentication failed
  - Usage: When API keys or credentials are invalid

- `1005`: Authorization Error
  - Description: Insufficient permissions
  - Usage: When attempting unauthorized operations

### RAG Error Codes (2000-2999)
- `2000`: RAG Generic Error
  - Description: General RAG operation error
  - Usage: When no specific RAG error code applies

- `2001`: Invalid Query
  - Description: Query validation failed
  - Usage: When the input query is invalid or malformed

- `2002`: Embedding Error
  - Description: Error generating embeddings
  - Usage: When text embedding operations fail

- `2003`: Source Retrieval Error
  - Description: Error retrieving source documents
  - Usage: When unable to fetch relevant sources

- `2004`: Generation Error
  - Description: Text generation failed
  - Usage: When LLM fails to generate response

- `2005`: Security Violation
  - Description: Security check failed
  - Usage: When security constraints are violated

### Knowledge Manager Errors (3000-3999)
- `3000`: Storage Error
  - Description: Knowledge storage operation failed
  - Usage: When database operations fail

- `3001`: Retrieval Error
  - Description: Knowledge retrieval failed
  - Usage: When unable to fetch stored knowledge

- `3002`: Index Error
  - Description: Vector index operation failed
  - Usage: When vector operations fail

## Error Handling Examples

### Basic Error Handling
```typescript
try {
  const result = await manager.generate("query");
  if (!result.success) {
    switch(result.error.code) {
      case '2001':
        console.error('Invalid query format');
        break;
      case '2002':
        console.error('Failed to generate embeddings');
        break;
      default:
        console.error(`Unknown error: ${result.error.message}`);
    }
  }
} catch (error) {
  if (error instanceof BaseError) {
    console.error(`Known error: ${error.code} - ${error.message}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Security Error Handling
```typescript
try {
  const result = await secureManager.generate("query");
} catch (error) {
  if (error instanceof RAGError && error.code === '2005') {
    console.error('Security violation:', error.details);
    // Implement security incident logging
  }
}
```

## Best Practices

1. Always check for specific error codes before falling back to generic handling
2. Include relevant context in error details
3. Log errors appropriately based on severity
4. Implement proper error recovery mechanisms
5. Use type guards for error instance checking

## Error Creation Guidelines

1. Use descriptive error messages
2. Include relevant error details
3. Use appropriate error codes
4. Maintain error hierarchy
5. Document new error codes

Example:
```typescript
throw new RAGError('Invalid embedding model specified', {
  code: '2002',
  details: {
    providedModel: model,
    allowedModels: ['text-embedding-ada-002']
  }
});
