# Persistence System Documentation

## Overview
The Lumix persistence system provides a flexible data storage mechanism with support for multiple storage backends through adapters.

## Core Types

### PersistenceConfig
Configuration options for persistence adapters.

```typescript
interface PersistenceConfig {
  adapter: string;      // Adapter identifier
  options?: Record<string, any>; // Adapter-specific options
}
```

### PersistenceEntry
Represents a stored item with metadata.

```typescript
interface PersistenceEntry<T> {
  key: string;         // Unique identifier
  value: T;           // Stored value
  metadata?: Record<string, any>; // Optional metadata
  createdAt: Date;    // Creation timestamp
  updatedAt: Date;    // Last update timestamp
}
```

## Usage Examples

### Basic Persistence Usage
```typescript
import { DefaultPersistenceManager } from '@lumix/core';
import { SQLiteAdapter } from '@lumix/adapter-sqlite';

// Initialize SQLite adapter
const adapter = new SQLiteAdapter({
  filename: 'data.db',
  tableName: 'app_data'
});

// Create persistence manager
const persistence = new DefaultPersistenceManager(adapter);
await persistence.init();

// Store a value with metadata
await persistence.set('user:123', {
  name: 'John Doe',
  email: 'john@example.com'
}, {
  tags: ['user', 'active'],
  version: '1.0.0'
});

// Retrieve a value
const entry = await persistence.get('user:123');
if (entry) {
  console.log('User:', entry.value);
  console.log('Metadata:', entry.metadata);
  console.log('Created:', entry.createdAt);
  console.log('Updated:', entry.updatedAt);
}
```

### Pattern Matching
```typescript
// Find all user entries
const userEntries = await persistence.find('user:*');
for (const entry of userEntries) {
  console.log(`${entry.key}: ${entry.value.name}`);
}

// List all keys
const allKeys = await persistence.keys();
console.log('Total keys:', allKeys.length);
```

### Maintenance Operations
```typescript
// Get storage stats
const stats = await persistence.stats();
console.log(`Total entries: ${stats.totalEntries}`);
console.log(`Storage size: ${stats.size} bytes`);
if (stats.lastSync) {
  console.log(`Last sync: ${stats.lastSync}`);
}

// Perform maintenance
await persistence.maintain();

// Clear all data
await persistence.clear();

// Close connection
await persistence.close();
```

## Error Handling

The persistence system uses the `PersistenceError` class for error handling:

```typescript
try {
  await persistence.set('key', 'value');
} catch (error) {
  if (error instanceof PersistenceError) {
    console.error(`Persistence error ${error.code}: ${error.message}`);
    console.error('Details:', error.details);
  }
}
```

Error codes:
- `5000`: Generic persistence error
- `5001`: Initialization error
- `5002`: Storage operation error
- `5003`: Invalid key format
- `5004`: Serialization error
- `5005`: Database error

## Available Adapters

### SQLite Adapter
The SQLite adapter provides persistent storage using SQLite database:

```typescript
const adapter = new SQLiteAdapter({
  filename: 'data.db',    // Database file path
  tableName: 'app_data'   // Optional table name
});
```

Features:
- Persistent storage
- ACID compliance
- Pattern-based search
- Metadata support
- Automatic maintenance

## Best Practices

1. **Key Management**
   - Use consistent key naming patterns
   - Consider using namespaces in keys (e.g., 'users:123')
   - Keep keys reasonably short
   - Use URL-safe characters

2. **Value Storage**
   - Store structured data as objects
   - Keep values reasonably sized
   - Consider compression for large values
   - Use appropriate data types

3. **Metadata Usage**
   - Use metadata for search optimization
   - Store version information
   - Include timestamps when needed
   - Add categorization tags

4. **Error Handling**
   - Always wrap operations in try-catch
   - Handle PersistenceError specifically
   - Log errors appropriately
   - Implement retry logic where needed

5. **Performance**
   - Batch operations when possible
   - Use pattern matching efficiently
   - Implement caching if needed
   - Regular maintenance

## Integration with RAG System

The persistence system can be used to store RAG results and embeddings:

```typescript
const ragPersistence = new DefaultPersistenceManager(
  new SQLiteAdapter({
    filename: 'rag.db',
    tableName: 'embeddings'
  })
);

async function storeEmbedding(
  text: string, 
  embedding: number[]
): Promise<void> {
  await ragPersistence.set(
    `embedding:${hash(text)}`,
    embedding,
    {
      text,
      timestamp: new Date(),
      model: 'text-embedding-ada-002'
    }
  );
}
```

## Performance Considerations

1. **Storage Efficiency**
   - Use appropriate data structures
   - Compress large values
   - Regular cleanup of old data
   - Monitor storage size

2. **Query Optimization**
   - Use efficient key patterns
   - Leverage metadata for filtering
   - Implement result caching
   - Batch operations

3. **Resource Management**
   - Close connections properly
   - Implement connection pooling
   - Monitor memory usage
   - Regular maintenance

## Related Components

- `BaseError`: Base error class
- `RAGKnowledgeManager`: RAG system integration
- `CacheManager`: Memory caching
