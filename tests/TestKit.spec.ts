import { Table, PrimaryKey, Column } from '../src/decorators';
import { createTestContext, InMemoryContext } from '../src/testing/InMemoryContext';
import { FixtureFactory } from '../src/testing/FixtureFactory';
import { expectQuery } from '../src/testing/SqlAssertions';

@Table('users')
class User {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;

  @Column({ defaultValue: 0 })
  score!: number;
}

const UserFactory = FixtureFactory.define(User, seq => ({
  id: seq,
  name: `User ${seq}`,
  email: `user${seq}@example.com`,
  score: seq * 10,
}));

describe('Testing Utilities (TestKit)', () => {
  describe('FixtureFactory', () => {
    it('builds entity instances with incremental sequences and overrides', () => {
      UserFactory.resetSequence();
      const u1 = UserFactory.build();
      expect(u1.id).toBe(1);
      expect(u1.name).toBe('User 1');
      expect(u1.email).toBe('user1@example.com');
      expect(u1.score).toBe(10);

      const u2 = UserFactory.build({ name: 'Custom Name', score: 99 });
      expect(u2.id).toBe(2);
      expect(u2.name).toBe('Custom Name');
      expect(u2.score).toBe(99);
    });

    it('builds a list of entity instances', () => {
      UserFactory.resetSequence();
      const users = UserFactory.buildList(3);
      expect(users).toHaveLength(3);
      expect(users.map(u => u.id)).toEqual([1, 2, 3]);
      expect(users.map(u => u.name)).toEqual(['User 1', 'User 2', 'User 3']);
    });

    it('creates and persists entity instances in InMemoryContext', async () => {
      const ctx = createTestContext({ entities: [User] });
      UserFactory.resetSequence();

      const created = await UserFactory.create(ctx, { name: 'Persisted User' });
      expect(created.name).toBe('Persisted User');

      const all = await ctx.set(User).toList();
      expect(all.length).toBeGreaterThanOrEqual(1);
      expect(all.some(u => u.name === 'Persisted User')).toBe(true);
    });

    it('creates and persists a list of entities in InMemoryContext', async () => {
      const ctx = createTestContext({ entities: [User] });
      UserFactory.resetSequence();

      const createdList = await UserFactory.createList(ctx, 3);
      expect(createdList).toHaveLength(3);

      const all = await ctx.set(User).toList();
      expect(all).toHaveLength(3);
    });
  });

  describe('InMemoryContext', () => {
    it('seeds and queries data in memory without an external database', async () => {
      const ctx = createTestContext({
        seedData: {
          users: [
            { id: 1, name: 'Alice', email: 'alice@test.com', score: 100 },
            { id: 2, name: 'Bob', email: 'bob@test.com', score: 200 },
          ],
        },
      });

      const users = await ctx
        .set(User)
        .where(u => u.score > 150)
        .toList();
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Bob');
    });

    it('records executed queries and can clear them', async () => {
      const ctx = createTestContext();
      ctx.seedTable('users', [{ id: 1, name: 'Charlie', email: 'c@test.com', score: 50 }]);

      await ctx
        .set(User)
        .where(u => u.id === 1)
        .firstOrDefault();
      expect(ctx.executedQueries.length).toBeGreaterThan(0);
      expect(ctx.executedQueries[0].sql).toContain('FROM "users"');

      ctx.clearExecutedQueries();
      expect(ctx.executedQueries).toHaveLength(0);
    });

    it('resets context state and re-seeds data', async () => {
      const ctx = createTestContext({
        seedData: {
          users: [{ id: 1, name: 'Initial', email: 'init@test.com', score: 10 }],
        },
      });

      // Add a user
      await ctx.set(User).add({ id: 2, name: 'Added', email: 'add@test.com', score: 20 });
      expect(ctx.getTableRows('users')).toHaveLength(2);

      // Reset
      ctx.reset();
      expect(ctx.getTableRows('users')).toHaveLength(1);
      expect(ctx.getTableRows('users')[0].name).toBe('Initial');
      expect(ctx.executedQueries).toHaveLength(0);
    });
  });

  describe('SqlAssertions (expectQuery)', () => {
    it('validates generated SQL with exact and containment matching', () => {
      const ctx = createTestContext();
      const query = ctx
        .set(User)
        .where(u => u.score > 50)
        .orderBy(u => u.name, 'asc');

      expectQuery(query).toContainSql('FROM "users"');
      expectQuery(query).toContainSql('ORDER BY');
      expectQuery(query).toMatchParams([50]);
    });

    it('matches exact SQL ignoring excessive whitespace', () => {
      const rawSql = 'SELECT "id",   "name"\nFROM "users"\nWHERE "id" = $1';
      expectQuery({ sql: rawSql, params: [42] })
        .toSQL('SELECT "id", "name" FROM "users" WHERE "id" = $1')
        .toMatchParams([42]);
    });

    it('throws descriptive assertion errors when expectations fail', () => {
      expect(() => {
        expectQuery('SELECT 1').toSQL('SELECT 2');
      }).toThrow('Expected SQL:');

      expect(() => {
        expectQuery('SELECT 1').toContainSql('DELETE');
      }).toThrow('Expected SQL to contain');

      expect(() => {
        expectQuery({ sql: 'SELECT 1', params: [1] }).toMatchParams([2]);
      }).toThrow('Parameter mismatch');
    });
  });
});
