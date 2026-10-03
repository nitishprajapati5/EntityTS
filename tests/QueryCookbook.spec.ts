import {
  DbContext,
  DbContextOptionsBuilder,
  Entity,
  Table,
  Column,
  PrimaryKey,
  HasMany,
  BelongsTo,
  SoftDelete,
  CreatedAt,
  UpdatedAt,
  QueryBuilder,
  SqlType,
} from '../src';

@Entity()
@Table('cookbook_users')
@SoftDelete({ column: 'deleted_at' })
class CookbookUser {
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

  @Column({ nullable: true })
  public department?: string;

  @Column({ type: SqlType.Json, nullable: true })
  public metadata?: any;

  @CreatedAt()
  @Column()
  public createdAt!: Date;

  @UpdatedAt()
  @Column()
  public updatedAt!: Date;

  @Column({ nullable: true })
  public deletedAt?: Date;

  @HasMany(() => CookbookPost, { foreignKey: 'userId' })
  public posts?: CookbookPost[];
}

@Entity()
@Table('cookbook_posts')
@SoftDelete({ column: 'deleted_at' })
class CookbookPost {
  @PrimaryKey({ autoIncrement: true })
  @Column()
  public id!: number;

  @Column()
  public userId!: number;

  @Column()
  public title!: string;

  @Column()
  public content!: string;

  @Column()
  public views!: number;

  @Column()
  public isPublished!: boolean;

  @Column({ nullable: true })
  public deletedAt?: Date;

  @BelongsTo(() => CookbookUser, { foreignKey: 'userId' })
  public author?: CookbookUser;
}

@Entity()
@Table('cookbook_employees')
class CookbookEmployee {
  @PrimaryKey({ autoIncrement: true })
  @Column()
  public id!: number;

  @Column()
  public name!: string;

  @Column()
  public department!: string;

  @Column({ nullable: true })
  public managerId?: number;
}

class CookbookDbContext extends DbContext {
  public users = this.set(CookbookUser);
  public posts = this.set(CookbookPost);
  public employees = this.set(CookbookEmployee);

  protected onConfiguring(options: DbContextOptionsBuilder): void {
    options.useSqlite(':memory:');
  }
}

describe('QUERIES.md - Comprehensive Query Cookbook Execution', () => {
  let db: CookbookDbContext;

  beforeEach(async () => {
    db = new CookbookDbContext();

    await db.executeRaw(`DROP TABLE IF EXISTS cookbook_posts`);
    await db.executeRaw(`DROP TABLE IF EXISTS cookbook_employees`);
    await db.executeRaw(`DROP TABLE IF EXISTS cookbook_users`);

    await db.executeRaw(`
      CREATE TABLE cookbook_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        age INTEGER NOT NULL,
        isActive INTEGER NOT NULL,
        department TEXT,
        metadata TEXT,
        createdAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        updatedAt TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
        deleted_at TEXT
      );
    `);

    await db.executeRaw(`
      CREATE TABLE IF NOT EXISTS cookbook_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        isPublished INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT
      );
    `);

    await db.executeRaw(`
      CREATE TABLE IF NOT EXISTS cookbook_employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        managerId INTEGER
      );
    `);

    // Seed users
    await db.users.addRange([
      {
        name: 'Alice Johnson',
        email: 'alice@company.com',
        role: 'admin',
        age: 32,
        isActive: true,
        department: 'Engineering',
        metadata: JSON.stringify({
          preferences: { notifications: { email: true } },
          billing: { storageUsedGb: 60 },
        }),
      },
      {
        name: 'Bob Smith',
        email: 'bob@partner.org',
        role: 'manager',
        age: 45,
        isActive: true,
        department: 'Engineering',
        metadata: JSON.stringify({
          preferences: { notifications: { email: false } },
          billing: { storageUsedGb: 10 },
        }),
      },
      {
        name: 'Charlie Davis',
        email: 'charlie@company.com',
        role: 'engineer',
        age: 26,
        isActive: true,
        department: 'Engineering',
        metadata: JSON.stringify({
          preferences: { notifications: { email: true } },
          billing: { storageUsedGb: 25 },
        }),
      },
      {
        name: 'Diana Prince',
        email: 'diana@external.io',
        role: 'guest',
        age: 22,
        isActive: false,
        department: undefined,
        metadata: undefined,
      },
    ]);

    // Seed posts
    await db.posts.addRange([
      {
        userId: 1,
        title: 'PostgreSQL Performance Optimization',
        content: 'Detailed indexing guide',
        views: 1500,
        isPublished: true,
      },
      {
        userId: 1,
        title: 'EntityTS Architecture',
        content: 'Design patterns in TypeScript',
        views: 800,
        isPublished: true,
      },
      {
        userId: 2,
        title: 'Engineering Management',
        content: 'Leading high throughput teams',
        views: 300,
        isPublished: true,
      },
      {
        userId: 3,
        title: 'Draft Post',
        content: 'WIP draft content',
        views: 0,
        isPublished: false,
      },
    ]);

    // Seed employees
    await db.employees.addRange([
      { name: 'Sarah Connor', department: 'Executive', managerId: undefined },
      { name: 'John Connor', department: 'Engineering', managerId: 1 },
      { name: 'Kyle Reese', department: 'Engineering', managerId: 2 },
    ]);
  });

  describe('1. Pure LINQ Lambda Predicates', () => {
    it('executes comparison predicates (<, <=, >, >=, ===, !==)', async () => {
      const adults = await db.users.where(u => u.age >= 30).toList();
      expect(adults.length).toBe(2);
      expect(adults.map(u => u.name).sort()).toEqual(['Alice Johnson', 'Bob Smith']);

      const nonGuests = await db.users.where(u => u.role !== 'guest').toList();
      expect(nonGuests.length).toBe(3);
    });

    it('executes compound predicates (&&, ||)', async () => {
      const activeEngineers = await db.users
        .where(u => u.department === 'Engineering' && u.isActive === true)
        .toList();
      expect(activeEngineers.length).toBe(3);

      const privileged = await db.users
        .where(u => (u.role === 'admin' || u.role === 'manager') && u.age >= 30)
        .toList();
      expect(privileged.length).toBe(2);
    });

    it('executes boolean shorthand and negation', async () => {
      const active = await db.users.where(u => u.isActive).toList();
      expect(active.length).toBe(3);

      const inactive = await db.users.where(u => !u.isActive).toList();
      expect(inactive.length).toBe(1);
      expect(inactive[0].name).toBe('Diana Prince');
    });

    it('executes null and undefined checks', async () => {
      const unassigned = await db.users.where(u => u.department === null).toList();
      expect(unassigned.length).toBe(1);
      expect(unassigned[0].name).toBe('Diana Prince');

      const assigned = await db.users.where(u => u.department !== null).toList();
      expect(assigned.length).toBe(3);
    });

    it('executes string pattern methods (startsWith, endsWith, includes)', async () => {
      const corporate = await db.users.where(u => u.email.endsWith('@company.com')).toList();
      expect(corporate.length).toBe(2);

      const startsWithA = await db.users.where(u => u.name.startsWith('Alice')).toList();
      expect(startsWithA.length).toBe(1);

      const engineers = await db.users.where(u => u.role.includes('eng')).toList();
      expect(engineers.length).toBe(1);
      expect(engineers[0].name).toBe('Charlie Davis');
    });

    it('executes array membership (IN operator)', async () => {
      const allowedRoles = ['admin', 'manager'];
      const result = await db.users.where(u => allowedRoles.includes(u.role)).toList();
      expect(result.length).toBe(2);
    });
  });

  describe('2. Materialization, Sorting & Pagination', () => {
    it('executes first, firstOrDefault, single, singleOrDefault', async () => {
      const firstAdmin = await db.users.where(u => u.role === 'admin').first();
      expect(firstAdmin!.name).toBe('Alice Johnson');

      const missing = await db.users.where(u => u.email === 'missing@none.com').firstOrDefault();
      expect(missing).toBeNull();

      const singleUser = await db.users.where(u => u.id === 1).single();
      expect(singleUser!.name).toBe('Alice Johnson');
    });

    it('sorts with orderBy and thenByDescending', async () => {
      const sorted = await db.users
        .orderBy(u => u.department)
        .thenByDescending(u => u.age)
        .toList();
      expect(sorted[0].name).toBe('Diana Prince'); // null department first or last depending on engine
      const engUsers = sorted.filter(u => u.department === 'Engineering');
      expect(engUsers[0].name).toBe('Bob Smith'); // age 45
    });

    it('paginates with toPagedList', async () => {
      const paged = await db.users.orderBy(u => u.id).toPagedList({ page: 1, pageSize: 2 });
      expect(paged.items.length).toBe(2);
      expect(paged.totalCount).toBe(4);
      expect(paged.totalPages).toBe(2);
      expect(paged.hasNextPage).toBe(true);
    });

    it('paginates with keyset / toCursorPage', async () => {
      const page1 = await db.users
        .orderBy(u => u.id)
        .toCursorPage({ limit: 2, orderBy: 'id', direction: 'asc' });
      expect(page1.items.length).toBe(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await db.users
        .orderBy(u => u.id)
        .toCursorPage({
          limit: 2,
          cursor: page1.nextCursor || undefined,
          orderBy: 'id',
          direction: 'asc',
        });
      expect(page2.items.length).toBe(2);
      expect(page2.items[0].id).toBe(3);
    });
  });

  describe('3. Projections, Aggregations & Quantifiers', () => {
    it('projects with select and distinct', async () => {
      const summaries = (
        await db.users
          .where(u => u.isActive)
          .select('id', 'name', 'role')
          .toList()
      ).map(u => ({ id: u.id, label: `${u.name} - ${u.role}` }));
      expect(summaries.length).toBe(3);
      expect(summaries[0].label).toContain('Alice Johnson');

      const depts = await db.users
        .where(u => u.department !== null)
        .select('department')
        .distinct()
        .toList();
      expect(depts.length).toBe(1); // All are Engineering
    });

    it('computes scalar aggregations (count, sum, avg, min, max)', async () => {
      const count = await db.users.where(u => u.isActive).count();
      expect(count).toBe(3);

      const totalViews = await db.posts.sum(p => p.views);
      expect(totalViews).toBe(2600);

      const avgAge = await db.users.where(u => u.isActive).avg(u => u.age);
      expect(avgAge).toBeCloseTo(34.33, 1);

      const minAge = await db.users.min(u => u.age);
      expect(minAge).toBe(22);

      const maxViews = await db.posts.max(p => p.views);
      expect(maxViews).toBe(1500);
    });

    it('evaluates any and all quantifiers', async () => {
      const hasAdmin = await db.users.any(u => u.role === 'admin');
      expect(hasAdmin).toBe(true);

      const allActive = await db.users.all(u => u.isActive);
      expect(allActive).toBe(false);
    });
  });

  describe('4. Relational Loading, Full-Text & Subqueries', () => {
    it('eager loads relations with include', async () => {
      const usersWithPosts = await db.users
        .where(u => u.id === 1)
        .include('posts')
        .toList();
      expect(usersWithPosts.length).toBe(1);
      expect(usersWithPosts[0].posts).toBeDefined();
      expect(usersWithPosts[0].posts?.length).toBe(2);
    });

    it('executes full-text search with whereSearch', async () => {
      const matches = await db.posts.whereSearch(['title', 'content'], 'PostgreSQL').toList();
      expect(matches.length).toBe(1);
      expect(matches[0].title).toContain('PostgreSQL');
    });

    it('executes subqueries and existence predicates', async () => {
      const activePostsSub = db
        .set('cookbook_posts')
        .where((w: any) => w.eq('isPublished', 1))
        .asSubquery('p');

      const authors = await db.users
        .whereExists(activePostsSub, (u, p) => {
          u.id.eq(p.userId);
        })
        .toList();
      expect(authors.length).toBe(2); // Alice and Bob have published posts
    });

    it('executes Common Table Expressions with withCte', async () => {
      const engUsers = db.users.where(u => u.department === 'Engineering');
      const query = db.posts.withCte('eng_users', engUsers);
      const results = await query.toList();
      expect(results.length).toBe(4);
    });
  });

  describe('5. Direct Batch Mutations & Bulk Operations', () => {
    it('executes direct SQL update with executeUpdate', async () => {
      const updated = await db.posts
        .where(p => p.userId === 1)
        .executeUpdate(s => s.set(p => p.views, 2000));
      expect(updated).toBe(2);

      const post1 = await db.posts.where(p => p.id === 1).first();
      expect(post1!.views).toBe(2000);
    });

    it('executes direct SQL delete with executeDelete', async () => {
      const deleted = await db.posts.where(p => p.views === 0 && !p.isPublished).executeDelete();
      expect(deleted).toBe(1);

      const remaining = await db.posts.count();
      expect(remaining).toBe(3);
    });

    it('executes bulkInsert', async () => {
      await db.users.bulkInsert([
        { name: 'Bulk 1', email: 'b1@ex.com', role: 'guest', age: 20, isActive: true },
        { name: 'Bulk 2', email: 'b2@ex.com', role: 'guest', age: 21, isActive: true },
      ]);
      const total = await db.users.count();
      expect(total).toBe(6);
    });
  });

  describe('6. Raw SQL & Native QueryBuilder', () => {
    it('executes parameterized fromSql query', async () => {
      const minAge = 30;
      const raw = await db.users
        .fromSql`SELECT * FROM cookbook_users WHERE age >= ${minAge} AND isActive = 1`;
      expect(raw.length).toBe(2);
    });

    it('executes multi-table joins using QueryBuilder', async () => {
      const qb = new QueryBuilder(db.adapter, 'cookbook_posts', 'p')
        .join('INNER', 'cookbook_users', 'p.userId', 'u.id', 'u')
        .select('p.id AS postId', 'p.title AS postTitle', 'u.name AS authorName')
        .where((w: any) => w.eq('p.isPublished', 1))
        .orderBy('p.id', 'asc');

      const { sql, params } = qb.toSelectSql();
      const rows = await db.adapter.executeQuery<any>(sql, params);
      expect(rows.length).toBe(3);
      expect(rows[0].authorName).toBe('Alice Johnson');
    });
  });
});
