import { NoSqlContext } from '../src/nosql/NoSqlContext';
import { MockNoSqlAdapter } from '../src/nosql/adapters/MockNoSqlAdapter';
import { DynamoDbAdapter } from '../src/nosql/adapters/DynamoDbAdapter';
import { RedisAdapter } from '../src/nosql/adapters/RedisAdapter';

interface UserDoc {
  id: string;
  name: string;
  dept: string;
  salary: number;
  roles?: string[];
}

interface OrderDoc {
  id: string;
  userId: string;
  amount: number;
}

describe('NoSQL Completeness: DynamoDB, Redis, Pipelines, Transactions & Indexes', () => {
  describe('DynamoDbAdapter', () => {
    it('supports insert, find, count, and index creation', async () => {
      const adapter = new DynamoDbAdapter();
      await adapter.connect();
      expect(await adapter.ping()).toBe(true);

      const ctx = new NoSqlContext(adapter);
      const users = ctx.collection<UserDoc>('users');

      await users.insert({ id: 'u1', name: 'Alice', dept: 'Eng', salary: 100000 });
      await users.insert({ id: 'u2', name: 'Bob', dept: 'HR', salary: 80000 });

      const found = await users.where({ dept: 'Eng' }).toList();
      expect(found.length).toBe(1);
      expect(found[0].name).toBe('Alice');

      const count = await users.count();
      expect(count).toBe(2);

      const idxName = await users.createIndex({ dept: 1 }, { name: 'idx_users_dept' });
      expect(idxName).toBe('idx_users_dept');

      await adapter.disconnect();
    });
  });

  describe('RedisAdapter', () => {
    it('supports document storage and direct KV / hash operations', async () => {
      const adapter = new RedisAdapter();
      await adapter.connect();
      expect(await adapter.ping()).toBe(true);

      // Document API
      const ctx = new NoSqlContext(adapter);
      const orders = ctx.collection<OrderDoc>('orders');
      await orders.insert({ id: 'o1', userId: 'u1', amount: 250 });

      const found = await orders.where({ userId: 'u1' }).toList();
      expect(found.length).toBe(1);
      expect(found[0].amount).toBe(250);

      // Direct KV
      await adapter.set('session:token123', 'user_u1');
      expect(await adapter.get('session:token123')).toBe('user_u1');
      await adapter.del('session:token123');
      expect(await adapter.get('session:token123')).toBeNull();

      // Direct Hash
      await adapter.hset('cache:metrics', 'cpu', '42%');
      await adapter.hset('cache:metrics', 'memory', '65%');
      expect(await adapter.hget('cache:metrics', 'cpu')).toBe('42%');
      const all = await adapter.hgetall('cache:metrics');
      expect(all).toEqual({ cpu: '42%', memory: '65%' });

      await adapter.disconnect();
    });
  });

  describe('Aggregation Pipeline Completeness', () => {
    let adapter: MockNoSqlAdapter;
    let ctx: NoSqlContext;

    beforeEach(async () => {
      adapter = new MockNoSqlAdapter();
      await adapter.connect();
      ctx = new NoSqlContext(adapter);

      const users = ctx.collection<UserDoc>('users');
      await users.insert({
        id: 'u1',
        name: 'Alice',
        dept: 'Engineering',
        salary: 120000,
        roles: ['admin', 'dev'],
      });
      await users.insert({
        id: 'u2',
        name: 'Bob',
        dept: 'Engineering',
        salary: 95000,
        roles: ['dev'],
      });
      await users.insert({
        id: 'u3',
        name: 'Charlie',
        dept: 'Sales',
        salary: 110000,
        roles: ['manager'],
      });

      const orders = ctx.collection<OrderDoc>('orders');
      await orders.insert({ id: 'ord1', userId: 'u1', amount: 500 });
      await orders.insert({ id: 'ord2', userId: 'u1', amount: 300 });
      await orders.insert({ id: 'ord3', userId: 'u2', amount: 150 });
    });

    it('supports $lookup join between collections', async () => {
      const users = ctx.collection<UserDoc>('users');
      const results = await users
        .lookup({
          from: 'orders',
          localField: 'id',
          foreignField: 'userId',
          as: 'userOrders',
        })
        .aggregate<any>();

      expect(results.length).toBe(3);
      const alice = results.find(u => u.name === 'Alice');
      expect(alice.userOrders.length).toBe(2);
      expect(alice.userOrders[0].amount).toBe(500);
    });

    it('supports $unwind to flatten array fields', async () => {
      const users = ctx.collection<UserDoc>('users');
      const results = await users.unwind('roles').aggregate<any>();

      // Alice has 2 roles, Bob 1, Charlie 1 -> 4 total
      expect(results.length).toBe(4);
      expect(results.filter(r => r.name === 'Alice').length).toBe(2);
    });

    it('supports $group with sum and avg accumulators', async () => {
      const users = ctx.collection<UserDoc>('users');
      const results = await users
        .group('$dept', {
          totalSalary: { $sum: '$salary' },
          count: { $sum: 1 },
        })
        .aggregate<any>();

      const eng = results.find(r => r._id === 'Engineering');
      expect(eng).toBeDefined();
      expect(eng.totalSalary).toBe(215000);
      expect(eng.count).toBe(2);

      const sales = results.find(r => r._id === 'Sales');
      expect(sales.totalSalary).toBe(110000);
      expect(sales.count).toBe(1);
    });

    it('supports $addFields to enrich documents', async () => {
      const users = ctx.collection<UserDoc>('users');
      const results = await users.addFields({ active: true, source: 'seed' }).aggregate<any>();

      expect(results.every(r => r.active === true && r.source === 'seed')).toBe(true);
    });

    it('supports $facet to run parallel sub-pipelines', async () => {
      const users = ctx.collection<UserDoc>('users');
      const results = await users
        .facet({
          byDept: [{ $group: { _id: '$dept', count: { $sum: 1 } } }],
          highEarners: [{ $match: { salary: { $gte: 100000 } } }],
        })
        .aggregate<any>();

      expect(results.length).toBe(1);
      const facet = results[0];
      expect(facet.byDept.length).toBe(2);
      expect(facet.highEarners.length).toBe(2); // Alice & Charlie
    });
  });

  describe('NoSQL ACID Multi-Document Transactions', () => {
    it('commits transaction on success', async () => {
      const adapter = new MockNoSqlAdapter();
      const ctx = new NoSqlContext(adapter);
      const users = ctx.collection<UserDoc>('users');

      await ctx.withTransaction(async () => {
        await users.insert({ id: 'tx1', name: 'CommittedUser', dept: 'Eng', salary: 90000 });
      });

      const found = await users.find('tx1');
      expect(found).toBeDefined();
      expect(found?.name).toBe('CommittedUser');
    });

    it('rolls back transaction on error', async () => {
      const adapter = new MockNoSqlAdapter();
      const ctx = new NoSqlContext(adapter);
      const users = ctx.collection<UserDoc>('users');

      await expect(
        ctx.withTransaction(async () => {
          await users.insert({ id: 'tx2', name: 'RolledBackUser', dept: 'Eng', salary: 90000 });
          throw new Error('Simulation of failure');
        }),
      ).rejects.toThrow('Simulation of failure');

      const found = await users.find('tx2');
      expect(found).toBeNull();
    });
  });

  describe('NoSQL Index Management', () => {
    it('ensures indexes across collections via ensureIndexes', async () => {
      const adapter = new MockNoSqlAdapter();
      const ctx = new NoSqlContext(adapter);

      await ctx.ensureIndexes({
        users: [
          { keys: { email: 1 }, options: { unique: true } },
          { keys: { dept: 1, salary: -1 } },
        ],
        orders: [{ keys: { userId: 1 } }],
      });
    });
  });
});
