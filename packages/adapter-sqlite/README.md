# @lumix/adapter-sqlite

SQLite数据库适配器，用于Lumix框架。

## 安装

```bash
pnpm add @lumix/adapter-sqlite
```

## 使用方法

```typescript
import { SQLiteAdapter } from '@lumix/adapter-sqlite';
import { z } from 'zod';

// 定义数据验证模式
const UserSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  email: z.string().email(),
  age: z.number().min(0)
});

// 创建适配器实例
const adapter = new SQLiteAdapter({
  filename: 'database.sqlite', // 数据库文件路径，默认为内存数据库
  memory: false,              // 是否使用内存数据库
  readonly: false,            // 是否只读模式
  schema: UserSchema         // 数据验证模式
});

// 连接数据库
await adapter.connect();

// 创建记录
const createResult = await adapter.create('users', {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});

// 查询记录
const findResult = await adapter.find('users', { name: 'John Doe' });

// 更新记录
const updateResult = await adapter.update(
  'users',
  { email: 'john@example.com' },
  { age: 31 }
);

// 删除记录
const deleteResult = await adapter.delete('users', { id: '123' });

// 批量操作
const batchResult = await adapter.batch('users', [
  {
    type: 'create',
    data: { name: 'Alice', email: 'alice@example.com', age: 25 }
  },
  {
    type: 'update',
    query: { email: 'john@example.com' },
    data: { age: 32 }
  }
]);

// 原生SQL查询
const queryResult = await adapter.query(
  'SELECT * FROM users WHERE age > ?',
  [30]
);

// 断开连接
await adapter.disconnect();
```

## 配置选项

| 选项 | 类型 | 默认值 | 描述 |
|------|------|---------|------|
| filename | string | ':memory:' | 数据库文件路径 |
| memory | boolean | true | 是否使用内存数据库 |
| readonly | boolean | false | 是否只读模式 |
| schema | z.ZodType | undefined | 数据验证模式 |

## 特性

- 支持内存数据库和文件数据库
- 支持只读模式
- 使用Zod进行数据验证
- 支持事务和批量操作
- 支持原生SQL查询
- 完整的TypeScript类型支持

## 许可证

MIT
