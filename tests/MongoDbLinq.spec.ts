import {
  DocumentQuery,
  NoSqlSet,
  NoSqlContext,
  MockNoSqlAdapter,
  MongoDbAdapter,
} from '../src/nosql';
import { EntityNotFoundException, DbException } from '../src/errors';

interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  role: string;
  status: string;
  isActive: boolean;
  score: number;
  createdAt: string;
}

describe('MongoDB & NoSQL LINQ Query Engine', () => {
  describe('DocumentQuery Compiler (LINQ -> MongoDB AST)', () => {
    it('compiles lambda comparison predicate with && into MongoDB filter', () => {
      const q = new DocumentQuery<User>('users');
      q.where((u: User) => u.age >= 18 && u.status === 'active');

      const filter = q.compileFilter();
      expect(filter).toEqual({
        age: { $gte: 18 },
        status: 'active',
      });
    });

    it('compiles lambda disjunction with || into $or filter', () => {
      const q = new DocumentQuery<User>('users');
      q.where((u: User) => u.role === 'admin' || u.role === 'manager');

      const filter = q.compileFilter();
      expect(filter).toEqual({
        $or: [{ role: 'admin' }, { role: 'manager' }],
      });
    });

    it('compiles string helper methods (.startsWith, .endsWith, .includes) into regex', () => {
      const q1 = new DocumentQuery<User>('users');
      q1.where((u: User) => u.name.startsWith('Alice'));
      expect(q1.compileFilter()).toEqual({
        name: { $regex: '^Alice' },
      });

      const q2 = new DocumentQuery<User>('users');
      q2.where((u: User) => u.email.endsWith('@company.com'));
      expect(q2.compileFilter()).toEqual({
        email: { $regex: '@company\\.com$' },
      });

      const q3 = new DocumentQuery<User>('users');
      q3.where((u: User) => u.email.includes('google'));
      expect(q3.compileFilter()).toEqual({
        email: { $regex: 'google' },
      });
    });

    it('compiles boolean property checks (u.isActive and !u.isActive)', () => {
      const q1 = new DocumentQuery<User>('users');
      q1.where((u: User) => u.isActive);
      expect(q1.compileFilter()).toEqual({ isActive: true });

      const q2 = new DocumentQuery<User>('users');
      q2.where((u: User) => !u.isActive);
      expect(q2.compileFilter()).toEqual({ isActive: false });
    });

    it('compiles fluent WhereClause builder callbacks', () => {
      const q = new DocumentQuery<User>('users');
      q.where((w: any) => w.gte('age', 21).eq('role', 'lead'));

      const filter = q.compileFilter();
      expect(filter).toEqual({
        age: { $gte: 21 },
        role: 'lead',
      });
    });

    it('compiles whereIn, whereNotIn, whereBetween, whereNull, whereNotNull, whereRegex', () => {
      const q = new DocumentQuery<User>('users')
        .whereIn(u => u.role, ['admin', 'manager'])
        .whereNotIn(u => u.status, ['banned'])
        .whereBetween(u => u.age, 20, 40)
        .whereNotNull(u => u.email)
        .whereRegex(u => u.name, '^Bob', 'i');

      const filter = q.compileFilter();
      expect(filter).toHaveProperty('role', { $in: ['admin', 'manager'] });
      expect(filter).toHaveProperty('status', { $nin: ['banned'] });
      expect(filter).toHaveProperty('email', { $ne: null });
      expect(filter).toHaveProperty('name', { $regex: '^Bob', $options: 'i' });
    });

    it('compiles chained orderBy, orderByDescending, thenBy, thenByDescending into sort object', () => {
      const q = new DocumentQuery<User>('users')
        .orderBy(u => u.role)
        .thenByDescending(u => u.age)
        .thenBy(u => u.name);

      const sort = q.compileSort();
      expect(sort).toEqual({
        role: 1,
        age: -1,
        name: 1,
      });
    });

    it('compiles projection fields into MongoDB projection object', () => {
      const q = new DocumentQuery<User>('users').select('id', 'name', 'email');
      const proj = q.compileProjection();
      expect(proj).toEqual({
        id: 1,
        name: 1,
        email: 1,
      });
    });

    it('compiles skip and take into FindOptions', () => {
      const q = new DocumentQuery<User>('users')
        .where({ isActive: true })
        .orderByDescending('createdAt')
        .skip(10)
        .take(25);

      const opts = q.compileFindOptions();
      expect(opts.skip).toBe(10);
      expect(opts.limit).toBe(25);
      expect(opts.sort).toEqual({ createdAt: -1 });
    });

    it('compiles complete Aggregation Pipeline', () => {
      const q = new DocumentQuery<User>('users')
        .where((u: User) => u.age >= 21)
        .orderByDescending('score')
        .skip(5)
        .take(10)
        .select('name', 'score');

      const pipeline = q.compileAggregationPipeline([{ $addFields: { isQualified: true } }]);

      expect(pipeline).toHaveLength(6);
      expect(pipeline[0]).toEqual({ $match: { age: { $gte: 21 } } });
      expect(pipeline[1]).toEqual({ $sort: { score: -1 } });
      expect(pipeline[2]).toEqual({ $skip: 5 });
      expect(pipeline[3]).toEqual({ $limit: 10 });
      expect(pipeline[4]).toEqual({ $project: { name: 1, score: 1 } });
      expect(pipeline[5]).toEqual({ $addFields: { isQualified: true } });
    });
  });

  describe('NoSqlSet LINQ Execution (In-Memory End-to-End)', () => {
    let mockAdapter: MockNoSqlAdapter;
    let users: NoSqlSet<User>;

    beforeEach(async () => {
      mockAdapter = new MockNoSqlAdapter();
      await mockAdapter.connect();
      users = new NoSqlSet<User>(mockAdapter, 'users');

      await users.addMany([
        {
          id: '1',
          name: 'Alice',
          email: 'alice@corp.com',
          age: 32,
          role: 'admin',
          status: 'active',
          isActive: true,
          score: 95,
          createdAt: '2026-01-01',
        },
        {
          id: '2',
          name: 'Bob',
          email: 'bob@corp.com',
          age: 24,
          role: 'member',
          status: 'active',
          isActive: true,
          score: 70,
          createdAt: '2026-01-02',
        },
        {
          id: '3',
          name: 'Charlie',
          email: 'charlie@other.com',
          age: 45,
          role: 'admin',
          status: 'active',
          isActive: false,
          score: 85,
          createdAt: '2026-01-03',
        },
        {
          id: '4',
          name: 'Diana',
          email: 'diana@corp.com',
          age: 19,
          role: 'member',
          status: 'active',
          isActive: true,
          score: 60,
          createdAt: '2026-01-04',
        },
      ]);
    });

    it('executes LINQ .where() with lambda and .toList()', async () => {
      const activeAdmins = await users
        .where((u: User) => u.role === 'admin' && u.isActive)
        .toList();

      expect(activeAdmins).toHaveLength(1);
      expect(activeAdmins[0].name).toBe('Alice');
    });

    it('executes LINQ .orderByDescending() and .take()', async () => {
      const topScorers = await users
        .orderByDescending(u => u.score)
        .take(2)
        .toList();

      expect(topScorers).toHaveLength(2);
      expect(topScorers[0].name).toBe('Alice'); // 95
      expect(topScorers[1].name).toBe('Charlie'); // 85
    });

    it('executes LINQ .select() projection', async () => {
      const projected = await users.select('name', 'score').where({ role: 'member' }).toList();

      expect(projected).toHaveLength(2);
      expect(projected[0].name).toBeDefined();
      expect(projected[0].score).toBeDefined();
      expect(projected[0].email).toBeUndefined();
    });

    it('executes LINQ .first(), .firstOrDefault(), .firstOrThrow()', async () => {
      const firstActive = await users.first((u: User) => u.isActive);
      expect(firstActive?.name).toBe('Alice');

      const nonExistent = await users.firstOrDefault({ name: 'Nonexistent' });
      expect(nonExistent).toBeNull();

      await expect(users.firstOrThrow({ name: 'Nonexistent' })).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it('executes LINQ .single(), .singleOrDefault(), .singleOrThrow()', async () => {
      const alice = await users.single({ email: 'alice@corp.com' });
      expect(alice?.name).toBe('Alice');

      // More than one admin -> throws DbException
      await expect(users.single({ role: 'admin' })).rejects.toThrow(DbException);

      // Nonexistent with singleOrDefault -> returns null
      const missing = await users.singleOrDefault({ email: 'none@corp.com' });
      expect(missing).toBeNull();

      // Nonexistent with singleOrThrow -> throws EntityNotFoundException
      await expect(users.singleOrThrow({ email: 'none@corp.com' })).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it('executes LINQ .count(), .any(), .all()', async () => {
      expect(await users.count()).toBe(4);
      expect(await users.count({ role: 'admin' })).toBe(2);

      expect(await users.any((u: User) => u.age > 40)).toBe(true);
      expect(await users.any({ role: 'superhero' })).toBe(false);

      expect(await users.all((u: User) => u.age > 10)).toBe(true);
      expect(await users.all((u: User) => u.role === 'admin')).toBe(false);
    });

    it('executes LINQ .paginate()', async () => {
      const page1 = await users.orderBy(u => u.name).paginate(1, 2);
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(4);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(2);
      expect(page1.hasNext).toBe(true);
      expect(page1.hasPrevious).toBe(false);

      const page2 = await users.orderBy(u => u.name).paginate(2, 2);
      expect(page2.items).toHaveLength(2);
      expect(page2.page).toBe(2);
      expect(page2.hasNext).toBe(false);
      expect(page2.hasPrevious).toBe(true);
    });

    it('executes LINQ mutations (.add, .update, .remove, .upsert)', async () => {
      // Add
      const eve = await users.add({
        id: '5',
        name: 'Eve',
        email: 'eve@corp.com',
        age: 28,
        role: 'member',
        status: 'active',
        isActive: true,
        score: 88,
        createdAt: '2026-01-05',
      });
      expect(eve.id).toBe('5');
      expect(await users.count()).toBe(5);

      // Update
      await users.update({ name: 'Eve' }, { score: 99 });
      const updatedEve = await users.first({ name: 'Eve' });
      expect(updatedEve?.score).toBe(99);

      // Remove
      await users.remove({ id: '5' });
      expect(await users.count()).toBe(4);

      // Upsert
      await users.upsert(
        { email: 'frank@corp.com' },
        {
          id: '6',
          name: 'Frank',
          email: 'frank@corp.com',
          age: 35,
          role: 'guest',
          status: 'active',
          isActive: true,
          score: 50,
          createdAt: '2026-01-06',
        },
      );
      const frank = await users.first({ email: 'frank@corp.com' });
      expect(frank?.name).toBe('Frank');
    });

    it('streams documents asynchronously via .stream()', async () => {
      const names: string[] = [];
      for await (const user of users.where({ isActive: true }).stream()) {
        names.push(user.name);
      }
      expect(names).toEqual(['Alice', 'Bob', 'Diana']);
    });
  });

  describe('NoSqlContext and Unit of Work Integration', () => {
    it('manages collections and scopes multi-document transactions', async () => {
      const mockAdapter = new MockNoSqlAdapter();
      const ctx = new NoSqlContext(mockAdapter);

      const userCollection = ctx.collection<User>('users');
      expect(userCollection).toBeInstanceOf(NoSqlSet);
      expect(userCollection.collectionName).toBe('users');

      // Transaction commit flow
      const committed = await ctx.withTransaction(async tx => {
        expect(tx.session).toBeDefined();
        await userCollection.add({
          id: 'tx_1',
          name: 'TxUser',
          email: 'tx@corp.com',
          age: 30,
          role: 'admin',
          status: 'active',
          isActive: true,
          score: 100,
          createdAt: '2026-01-01',
        });
        return true;
      });
      expect(committed).toBe(true);

      // Transaction rollback on error
      await expect(
        ctx.withTransaction(async () => {
          throw new Error('Simulated failure during checkout');
        }),
      ).rejects.toThrow('Simulated failure during checkout');
    });
  });

  describe('MongoDbAdapter integration with NoSqlSet', () => {
    it('passes compiled LINQ filters and options directly to MongoDbAdapter', async () => {
      const mockCol = {
        find: jest.fn().mockReturnValue({
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue([{ id: '1', name: 'Alice', age: 30 }]),
        }),
      };
      const mockDb = { collection: jest.fn().mockReturnValue(mockCol) };
      const mockClient = { connect: jest.fn(), db: jest.fn().mockReturnValue(mockDb) };

      const mongo = new MongoDbAdapter({ database: 'test', client: mockClient });
      const set = new NoSqlSet<User>(mongo, 'users');

      const results = await set
        .where((u: User) => u.age > 25 && u.role === 'admin')
        .orderByDescending(u => u.score)
        .select('name', 'age')
        .skip(5)
        .take(10)
        .toList();

      expect(results).toHaveLength(1);
      expect(mockCol.find).toHaveBeenCalledWith(
        {
          age: { $gt: 25 },
          role: 'admin',
        },
        undefined,
      );
    });
  });
});
