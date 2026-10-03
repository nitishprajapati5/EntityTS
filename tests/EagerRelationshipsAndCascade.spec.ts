import {
  Table,
  PrimaryKey,
  Column,
  ManyToMany,
  OneToMany,
  ManyToOne,
  OneToOne,
} from '../src/decorators';
import { MockDbAdapter } from '../src/adapters/MockDbAdapter';
import { DbContext } from '../src/context/DbContext';
import { DbSet } from '../src/set/DbSet';
import { UnitOfWork } from '../src/uow/UnitOfWork';

@Table('tags')
class Tag {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;
}

@Table('authors')
class Author {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;

  @OneToMany(() => Post, (p: any) => p.author, { foreignKey: 'authorId', cascade: true })
  posts?: Post[];
}

@Table('posts')
class Post {
  @PrimaryKey()
  id!: number;

  @Column()
  title!: string;

  @Column({ nullable: true })
  authorId?: number;

  @ManyToOne(() => Author, (a: any) => a.posts, { foreignKey: 'authorId' })
  author?: Author;

  @ManyToMany(() => Tag, {
    through: 'post_tags',
    foreignKey: 'postId',
    otherKey: 'tagId',
  })
  tags?: Tag[];
}

class TestBlogContext extends DbContext {
  public readonly authors = this.set(Author);
  public readonly posts = this.set(Post);
  public readonly tags = this.set(Tag);
}

describe('Real Relationships: Eager Loading, ManyToMany, and Cascade', () => {
  let adapter: MockDbAdapter;
  let context: TestBlogContext;

  beforeEach(async () => {
    adapter = new MockDbAdapter({
      tables: {
        authors: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        posts: [
          { id: 10, title: 'Post 1', authorId: 1 },
          { id: 20, title: 'Post 2', authorId: 1 },
          { id: 30, title: 'Post 3', authorId: 2 },
        ],
        tags: [
          { id: 100, name: 'TypeScript' },
          { id: 200, name: 'ORM' },
          { id: 300, name: 'Node.js' },
        ],
        post_tags: [
          { postId: 10, tagId: 100 },
          { postId: 10, tagId: 200 },
          { postId: 20, tagId: 200 },
          { postId: 30, tagId: 300 },
        ],
      },
    });
    context = new TestBlogContext({ adapter });
  });

  describe('Eager Loading ManyToMany', () => {
    it('eagerly loads many-to-many relationships through a junction table', async () => {
      const posts = await context.posts.include('tags').toList();

      expect(posts.length).toBe(3);

      const post1 = posts.find(p => p.id === 10);
      expect(post1).toBeDefined();
      expect(post1?.tags).toBeDefined();
      expect(post1?.tags?.length).toBe(2);
      expect(post1?.tags?.map(t => t.name)).toEqual(expect.arrayContaining(['TypeScript', 'ORM']));

      const post2 = posts.find(p => p.id === 20);
      expect(post2?.tags?.length).toBe(1);
      expect(post2?.tags?.[0].name).toBe('ORM');

      const post3 = posts.find(p => p.id === 30);
      expect(post3?.tags?.length).toBe(1);
      expect(post3?.tags?.[0].name).toBe('Node.js');
    });
  });

  describe('Eager Loading OneToMany and ManyToOne', () => {
    it('eagerly loads OneToMany relationships', async () => {
      const authors = await context.authors.include('posts').toList();
      expect(authors.length).toBe(2);

      const alice = authors.find(a => a.id === 1);
      expect(alice?.posts?.length).toBe(2);
      expect(alice?.posts?.map(p => p.title)).toEqual(expect.arrayContaining(['Post 1', 'Post 2']));
    });

    it('eagerly loads ManyToOne relationships', async () => {
      const posts = await context.posts.include('author').toList();
      const post1 = posts.find(p => p.id === 10);
      expect(post1?.author).toBeDefined();
      expect(post1?.author?.name).toBe('Alice');
    });
  });

  describe('Cascade Insert and Delete with UnitOfWork', () => {
    it('cascades insert to child entities and propagates parent foreign key', async () => {
      const uow = new UnitOfWork(context);

      const newAuthor = new Author();
      newAuthor.id = 5;
      newAuthor.name = 'Charlie';

      const postA = new Post();
      postA.id = 50;
      postA.title = 'Charlie First Post';

      const postB = new Post();
      postB.id = 51;
      postB.title = 'Charlie Second Post';

      newAuthor.posts = [postA, postB];

      // Register only the parent with cascade: true configured on OneToMany
      uow.registerNew(context.authors, newAuthor);

      // Pending count should be 3 (1 parent + 2 children)
      expect(uow.pendingCount).toBe(3);

      const result = await uow.commit();
      expect(result.insertedCount).toBe(3);

      // Verify the children were inserted into mock database with correct authorId
      const savedPosts = await context.posts.where({ authorId: 5 }).toList();
      expect(savedPosts.length).toBe(2);
      expect(savedPosts.map(p => p.title)).toContain('Charlie First Post');
      expect(savedPosts.map(p => p.title)).toContain('Charlie Second Post');
    });

    it('cascades delete to child entities when cascade delete is enabled', async () => {
      const uow = new UnitOfWork(context);

      const authorToDelete = new Author();
      authorToDelete.id = 1;
      authorToDelete.name = 'Alice';

      const childPost = new Post();
      childPost.id = 10;
      childPost.title = 'Post 1';

      authorToDelete.posts = [childPost];

      uow.registerDeleted(context.authors, authorToDelete);
      expect(uow.pendingCount).toBe(2); // author + post
    });
  });
});
