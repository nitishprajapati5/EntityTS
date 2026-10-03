import {
  DbContext,
  DbContextOptionsBuilder,
  Entity,
  Table,
  Column,
  PrimaryKey,
  SoftDelete,
  UpdatedAt,
  DbSet,
  DbException,
  EntityNotFoundException,
} from '../src';

@Entity()
@Table('test_linq_users')
class LinqUser {
  @PrimaryKey({ autoIncrement: true })
  @Column()
  public id!: number;

  @Column()
  public name!: string;

  @Column()
  public email!: string;

  @Column()
  public role!: string;

  @Column()
  public age!: number;

  @Column()
  public isActive!: boolean;

  @UpdatedAt()
  @Column()
  public updatedAt!: Date;

  @Column({ nullable: true })
  public notes?: string;
}

@Entity()
@Table('test_linq_posts')
@SoftDelete({ column: 'deleted_at' })
class LinqPost {
  @PrimaryKey({ autoIncrement: true })
  @Column()
  public id!: number;

  @Column()
  public title!: string;

  @Column()
  public status!: string;

  @Column()
  public deletedAt?: Date;
}

class LinqTestDbContext extends DbContext {
  public users = this.set(LinqUser);
  public posts = this.set(LinqPost);

  protected onConfiguring(options: DbContextOptionsBuilder): void {
    options.useSqlite(':memory:');
  }
}

class TrackingByDefaultDbContext extends DbContext {
  public users = this.set(LinqUser);

  protected onConfiguring(options: DbContextOptionsBuilder): void {
    options.useSqlite(':memory:');
    options.useTracking();
  }
}

describe('LINQ Queries, Batch Mutations & Query Change Tracking', () => {
  let db: LinqTestDbContext;

  beforeEach(async () => {
    db = new LinqTestDbContext();
    await db.executeRaw(`
      CREATE TABLE IF NOT EXISTS test_linq_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        age INTEGER NOT NULL,
        isActive INTEGER NOT NULL,
        updatedAt TEXT,
        notes TEXT
      );
    `);
    await db.executeRaw(`
      CREATE TABLE IF NOT EXISTS test_linq_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        deleted_at TEXT
      );
    `);

    // Seed test users
    await db.users.addRange([
      { name: 'Alice', email: 'alice@example.com', role: 'admin', age: 30, isActive: true },
      { name: 'Bob', email: 'bob@example.com', role: 'guest', age: 22, isActive: true },
      { name: 'Charlie', email: 'charlie@example.com', role: 'guest', age: 17, isActive: false },
      { name: 'Diana', email: 'diana@example.com', role: 'member', age: 28, isActive: true },
    ]);

    // Seed test posts
    await db.posts.addRange([
      { title: 'Post 1', status: 'draft' },
      { title: 'Post 2', status: 'published' },
      { title: 'Post 3', status: 'draft' },
    ]);
  });

  describe('1. LINQ Filtering & Pure Lambda Predicates (No String Operators)', () => {
    it('filters using comparison predicate: where(u => u.age >= 25)', async () => {
      const adults = await db.users.where(u => u.age >= 25).toList();
      expect(adults.length).toBe(2);
      expect(adults.map(u => u.name).sort()).toEqual(['Alice', 'Diana']);
    });

    it('filters using equality predicate: where(u => u.email === "...")', async () => {
      const user = await db.users.where(u => u.email === 'alice@example.com').firstOrDefault();
      expect(user).not.toBeNull();
      expect(user!.name).toBe('Alice');
    });

    it('filters using inequality predicate: where(u => u.role !== "guest")', async () => {
      const nonGuests = await db.users.where(u => u.role !== 'guest').toList();
      expect(nonGuests.length).toBe(2);
      expect(nonGuests.map(u => u.name).sort()).toEqual(['Alice', 'Diana']);
    });

    it('filters using boolean property shorthand: where(u => u.isActive) and where(u => !u.isActive)', async () => {
      const active = await db.users.where(u => u.isActive).toList();
      expect(active.length).toBe(3);

      const inactive = await db.users.where(u => !u.isActive).toList();
      expect(inactive.length).toBe(1);
      expect(inactive[0].name).toBe('Charlie');
    });

    it('filters using string LINQ methods: startsWith, endsWith, includes (no string LIKE operator)', async () => {
      // startsWith
      const charlieList = await db.users.where(u => u.name.startsWith('Char')).toList();
      expect(charlieList.length).toBe(1);
      expect(charlieList[0].name).toBe('Charlie');

      // endsWith
      const dianaList = await db.users.where(u => u.name.endsWith('na')).toList();
      expect(dianaList.length).toBe(1);
      expect(dianaList[0].name).toBe('Diana');

      // includes
      const licList = await db.users.where(u => u.name.includes('lic')).toList();
      expect(licList.length).toBe(1);
      expect(licList[0].name).toBe('Alice');
    });

    it('filters using array containment: where(u => [..].includes(u.role)) (no string IN operator)', async () => {
      const staff = await db.users.where(u => ['admin', 'member'].includes(u.role)).toList();
      expect(staff.length).toBe(2);
      expect(staff.map(u => u.name).sort()).toEqual(['Alice', 'Diana']);
    });

    it('filters using null checks: where(u => u.notes === null) and where(u => u.notes !== null) (no string IS NULL operator)', async () => {
      const noNotes = await db.users.where(u => u.notes === null).toList();
      expect(noNotes.length).toBe(4);

      await db.users.where(u => u.name === 'Alice').executeUpdate({ notes: 'Lead Architect' });
      const hasNotes = await db.users.where(u => u.notes !== null).toList();
      expect(hasNotes.length).toBe(1);
      expect(hasNotes[0].name).toBe('Alice');
    });

    it('filters using compound logical predicates: && and ||', async () => {
      // Conjunction &&
      const matureActive = await db.users.where(u => u.age >= 25 && u.isActive).toList();
      expect(matureActive.length).toBe(2);
      expect(matureActive.map(u => u.name).sort()).toEqual(['Alice', 'Diana']);

      // Disjunction ||
      const privileged = await db.users
        .where(u => u.role === 'admin' || u.role === 'member')
        .toList();
      expect(privileged.length).toBe(2);
      expect(privileged.map(u => u.name).sort()).toEqual(['Alice', 'Diana']);
    });
  });

  describe('2. Single Item Lookups & Quantifiers with LinqPredicate', () => {
    it('firstOrDefault finds item matching lambda predicate or returns null', async () => {
      const found = await db.users.firstOrDefault(u => u.email === 'bob@example.com');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Bob');

      const notFound = await db.users.firstOrDefault(u => u.email === 'nonexistent@test.com');
      expect(notFound).toBeNull();
    });

    it('firstOrThrow returns first matching item or throws EntityNotFoundException', async () => {
      const user = await db.users.firstOrThrow(u => u.name === 'Diana');
      expect(user.role).toBe('member');

      await expect(db.users.firstOrThrow(u => u.name === 'Ghost')).rejects.toThrow(
        EntityNotFoundException,
      );
    });

    it('singleOrDefault returns single item or throws when multiple match', async () => {
      const single = await db.users.singleOrDefault(u => u.email === 'alice@example.com');
      expect(single).not.toBeNull();
      expect(single!.name).toBe('Alice');

      const nonExistent = await db.users.singleOrDefault(u => u.name === 'None');
      expect(nonExistent).toBeNull();

      // Multiple guests exist (Bob and Charlie) -> throws DbException
      await expect(db.users.singleOrDefault(u => u.role === 'guest')).rejects.toThrow(DbException);
    });

    it('any & all evaluate quantifiers using lambda predicates', async () => {
      const hasAdmins = await db.users.any(u => u.role === 'admin');
      expect(hasAdmins).toBe(true);

      const hasSuperuser = await db.users.any(u => u.role === 'superuser');
      expect(hasSuperuser).toBe(false);

      const allActive = await db.users.all(u => u.isActive === true);
      expect(allActive).toBe(false); // Charlie is inactive

      const allRegistered = await db.users.all(u => u.age > 0);
      expect(allRegistered).toBe(true);
    });

    it('supports custom in-memory lambda predicate in firstOrDefault', async () => {
      const user = await db.users.firstOrDefault(u => u.name.startsWith('Char'));
      expect(user).not.toBeNull();
      expect(user!.name).toBe('Charlie');
    });
  });

  describe('3. Batch Mutations: executeUpdate & updateWhere with Pure Predicates', () => {
    it('executes bulk update via executeUpdate with a partial object', async () => {
      const affected = await db.users
        .where(u => u.role === 'guest')
        .executeUpdate({ role: 'contributor' });

      expect(affected).toBe(2);

      const contributors = await db.users.where(u => u.role === 'contributor').toList();
      expect(contributors.length).toBe(2);
      expect(contributors.map(u => u.name).sort()).toEqual(['Bob', 'Charlie']);
    });

    it('executes bulk update via executeUpdate with UpdateSetBuilder callback', async () => {
      const affected = await db.users
        .where(u => u.name === 'Charlie')
        .executeUpdate(s => s.set(u => u.isActive, true).set(u => u.role, 'member'));

      expect(affected).toBe(1);

      const charlie = await db.users.firstOrThrow(u => u.name === 'Charlie');
      expect(Boolean(charlie.isActive)).toBe(true);
      expect(charlie.role).toBe('member');
    });

    it('executes bulk update via updateWhere shorthand with pure lambda predicate', async () => {
      const affected = await db.users.updateWhere(u => u.name === 'Bob', { role: 'vip' });

      expect(affected).toBe(1);

      const bob = await db.users.firstOrThrow(u => u.name === 'Bob');
      expect(bob.role).toBe('vip');
    });
  });

  describe('4. Batch Mutations: executeDelete & removeWhere with Pure Predicates', () => {
    it('executes bulk delete via executeDelete', async () => {
      const affected = await db.users.where(u => u.age < 20).executeDelete();

      expect(affected).toBe(1); // Charlie (age 17)

      const remaining = await db.users.toList();
      expect(remaining.length).toBe(3);
      expect(remaining.some(u => u.name === 'Charlie')).toBe(false);
    });

    it('respects soft-delete in executeDelete and removeWhere', async () => {
      // 2 drafts exist
      const affected = await db.posts.where(p => p.status === 'draft').executeDelete();

      expect(affected).toBe(2);

      // By default soft-deleted records are filtered out
      const activePosts = await db.posts.toList();
      expect(activePosts.length).toBe(1);
      expect(activePosts[0].title).toBe('Post 2');

      // withDeleted retrieves all 3 posts
      const allPosts = await db.posts.withDeleted().toList();
      expect(allPosts.length).toBe(3);
    });

    it('performs hard delete on soft-delete model when hardDelete: true is passed', async () => {
      const affected = await db.posts
        .where(p => p.title === 'Post 2')
        .executeDelete({ hardDelete: true });

      expect(affected).toBe(1);

      // Verify row is physically gone from database
      const count = await db.posts
        .withDeleted()
        .where(p => p.title === 'Post 2')
        .count();
      expect(count).toBe(0);
    });

    it('executes removeWhere with lambda predicate', async () => {
      const affected = await db.users.removeWhere(u => u.role === 'admin');
      expect(affected).toBe(1);

      const alice = await db.users.firstOrDefault(u => u.name === 'Alice');
      expect(alice).toBeNull();
    });
  });

  describe('5. Query Change Tracking & Unit of Work (saveChanges)', () => {
    it('does not track entities by default when asTracking is not used', async () => {
      const users = await db.users.where(u => u.name === 'Diana').toList();
      expect(users.length).toBe(1);

      const entry = db.changeTracker.entry(users[0]);
      expect(entry).toBeUndefined();
    });

    it('tracks entities when .asTracking() is chained on LINQ query and flushes changes on saveChanges()', async () => {
      const users = await db.users
        .where(u => u.name === 'Diana')
        .asTracking()
        .toList();

      expect(users.length).toBe(1);
      const diana = users[0];

      // Mutate property directly on tracked entity proxy
      diana.role = 'executive';
      diana.age = 29;

      expect(db.changeTracker.hasChanges()).toBe(true);

      // Flush changes to database atomically
      const affected = await db.saveChanges();
      expect(affected).toBe(1);
      expect(db.changeTracker.hasChanges()).toBe(false);

      // Verify persisted in database
      const refreshed = await db.users.firstOrThrow(u => u.name === 'Diana');
      expect(refreshed.role).toBe('executive');
      expect(refreshed.age).toBe(29);
    });

    it('supports asNoTracking() to explicitly bypass tracking', async () => {
      const users = await db.users
        .asNoTracking()
        .where(u => u.name === 'Alice')
        .toList();

      expect(db.changeTracker.entry(users[0])).toBeUndefined();
    });

    it('supports DbContextOptionsBuilder.useTracking() to track all queries by default', async () => {
      const trackDb = new TrackingByDefaultDbContext();
      await trackDb.executeRaw(`
        CREATE TABLE IF NOT EXISTS test_linq_users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL,
          age INTEGER NOT NULL,
          isActive INTEGER NOT NULL,
          updatedAt TEXT
        );
      `);
      await trackDb.users.add({
        name: 'Bob',
        email: 'bob@example.com',
        role: 'guest',
        age: 22,
        isActive: true,
      });

      const users = await trackDb.users.where(u => u.name === 'Bob').toList();
      expect(users.length).toBe(1);

      const entry = trackDb.changeTracker.entry(users[0]);
      expect(entry).toBeDefined();

      users[0].name = 'Robert';
      expect(trackDb.changeTracker.hasChanges()).toBe(true);

      const saved = await trackDb.saveChanges();
      expect(saved).toBe(1);

      const updated = await trackDb.users.firstOrThrow(u => u.id === users[0].id);
      expect(updated.name).toBe('Robert');
    });
  });
});
