# Cache System Documentation

## Overview
The Lumix cache system provides an efficient in-memory caching mechanism with TTL (Time To Live) support and namespace isolation.

## Core Types

### CacheConfig
Configuration options for the cache system.

```typescript
interface CacheConfig {
  maxSize?: number;    // Maximum number of entries
  ttl?: number;        // Time to live in milliseconds
  namespace?: string;  // Cache namespace for isolation
}
```

### CacheEntry
Internal representation of a cached item.

```typescript
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}
```

## Usage Examples

### Basic Cache Usage
```typescript
const cache = new CacheManager<string>({
  maxSize: 1000,
  ttl: 3600000, // 1 hour
  namespace: 'app-cache'
});

// Set a value
cache.set('key1', 'value1');

// Get a value
const value = cache.get('key1');
if (value) {
  console.log('Cache hit:', value);
} else {
  console.log('Cache miss');
}

// Check if key exists
if (cache.has('key1')) {
  console.log('Key exists in cache');
}

// Delete a value
cache.delete('key1');
```

### Type-Safe Caching
```typescript
interface UserData {
  id: string;
  name: string;
  email: string;
}

const userCache = new CacheManager<UserData>({
  maxSize: 100,
  ttl: 1800000, // 30 minutes
  namespace: 'users'
});

userCache.set('user1', {
  id: '1',
  name: 'John Doe',
  email: 'john@example.com'
});

const user = userCache.get('user1');
if (user) {
  console.log(user.name); // Type-safe access
}
```

### Cache Management
```typescript
// Get cache stats
const stats = cache.stats();
console.log(`Cache size: ${stats.size}/${stats.maxSize}`);
console.log(`TTL: ${stats.ttl}ms`);
console.log(`Namespace: ${stats.namespace}`);

// Update configuration
cache.updateConfig({
  maxSize: 2000,
  ttl: 7200000 // 2 hours
});

// Clear cache
cache.clear();
```

## Error Handling

The cache system uses the `CacheError` class for error handling:

```typescript
try {
  // Cache operations
} catch (error) {
  if (error instanceof CacheError) {
    console.error(`Cache error ${error.code}: ${error.message}`);
    console.error('Details:', error.details);
  }
}
```

Error codes:
- `4000`: Generic cache error
- `4001`: Invalid configuration
- `4002`: Cache capacity exceeded
- `4003`: Invalid key format
- `4004`: Serialization error

## Best Practices

1. **Namespace Usage**
   - Use namespaces to isolate different types of cached data
   - Keep namespace names descriptive and consistent
   - Consider using constants for namespace names

2. **TTL Configuration**
   - Set appropriate TTL based on data freshness requirements
   - Use shorter TTLs for frequently changing data
   - Consider using different TTLs for different types of data

3. **Cache Size Management**
   - Monitor cache size using stats()
   - Set appropriate maxSize to prevent memory issues
   - Consider data volume when configuring cache size

4. **Type Safety**
   - Always use generic type parameter
   - Define interfaces for complex cached data
   - Validate data before caching

5. **Error Handling**
   - Always wrap cache operations in try-catch blocks
   - Handle CacheError specifically
   - Log cache errors appropriately

## Integration with RAG System

The cache system can be used to optimize RAG operations:

```typescript
const ragCache = new CacheManager<RAGGenerationResult>({
  maxSize: 500,
  ttl: 3600000, // 1 hour
  namespace: 'rag-results'
});

async function getCachedRAGResult(query: string): Promise<RAGGenerationResult> {
  const cached = ragCache.get(query);
  if (cached) {
    return cached;
  }

  const result = await generateRAGResult(query);
  ragCache.set(query, result);
  return result;
}
```

## Performance Considerations

1. **Memory Usage**
   - Monitor cache size regularly
   - Implement cleanup strategies
   - Use appropriate maxSize limits

2. **TTL Optimization**
   - Balance freshness vs performance
   - Consider data update frequency
   - Implement cache warming for critical data

3. **Namespace Isolation**
   - Use separate namespaces for different data types
   - Implement namespace cleanup strategies
   - Monitor namespace sizes independently

## Related Components

- `BaseError`: Base error class
- `RAGKnowledgeManager`: RAG system integration
- `CacheManager`: Main cache implementation
