import { MongoMemoryServer } from 'mongodb-memory-server';
import { DatabaseManager } from '@lumix/core';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  // 启动内存数据库
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // 配置数据库管理器
  const dbManager = DatabaseManager.getInstance();
  await dbManager.connect({
    uri,
    dbName: 'test',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  });

  // 设置测试数据
  await setupTestData();
});

afterAll(async () => {
  // 清理数据库
  const dbManager = DatabaseManager.getInstance();
  await dbManager.dropDatabase();
  await dbManager.disconnect();

  // 关闭内存数据库
  await mongod.stop();
});

beforeEach(async () => {
  // 清理集合
  const dbManager = DatabaseManager.getInstance();
  const collections = await dbManager.listCollections();
  for (const collection of collections) {
    await dbManager.dropCollection(collection.name);
  }

  // 重置测试数据
  await setupTestData();
});

async function setupTestData() {
  const dbManager = DatabaseManager.getInstance();

  // 创建测试集合
  await dbManager.createCollection('tokens');
  await dbManager.createCollection('transactions');
  await dbManager.createCollection('holders');
  await dbManager.createCollection('events');

  // 插入测试数据
  await dbManager.insertMany('tokens', [
    {
      address: '0x1234567890123456789012345678901234567890',
      chain: 'ethereum',
      name: 'Test Token',
      symbol: 'TEST',
      decimals: 18,
      totalSupply: '1000000000000000000000000',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  await dbManager.insertMany('transactions', [
    {
      hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '1000000000000000000',
      timestamp: new Date(),
      blockNumber: 1000000,
      status: true
    }
  ]);

  await dbManager.insertMany('holders', [
    {
      address: '0x1111111111111111111111111111111111111111',
      token: '0x1234567890123456789012345678901234567890',
      balance: '500000000000000000000000',
      percentage: 50,
      lastTransfer: new Date(),
      transferCount: 1
    },
    {
      address: '0x2222222222222222222222222222222222222222',
      token: '0x1234567890123456789012345678901234567890',
      balance: '500000000000000000000000',
      percentage: 50,
      lastTransfer: new Date(),
      transferCount: 1
    }
  ]);

  await dbManager.insertMany('events', [
    {
      type: 'transfer',
      token: '0x1234567890123456789012345678901234567890',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '1000000000000000000',
      timestamp: new Date(),
      blockNumber: 1000000,
      transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    }
  ]);
} 