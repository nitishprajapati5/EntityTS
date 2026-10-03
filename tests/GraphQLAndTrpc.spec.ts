import { Table, PrimaryKey, Column, OneToMany, ManyToOne } from '../src/decorators';
import { DbContext } from '../src/context/DbContext';
import { MockDbAdapter } from '../src/adapters/MockDbAdapter';
import { GraphQLSchemaBuilder, DataLoaderBatcher } from '../src/graphql';
import { TrpcRouterBuilder } from '../src/trpc';

@Table('authors')
class Author {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;

  @OneToMany(() => Book, b => b.author, { foreignKey: 'authorId' })
  books?: Book[];
}

@Table('books')
class Book {
  @PrimaryKey()
  id!: number;

  @Column()
  title!: string;

  @Column()
  authorId!: number;

  @ManyToOne(() => Author, a => a.books, { foreignKey: 'authorId' })
  author?: Author;
}

class LibraryContext extends DbContext {
  public readonly authors = this.set(Author);
  public readonly books = this.set(Book);
}

describe('GraphQL and tRPC Adapters', () => {
  let adapter: MockDbAdapter;
  let context: LibraryContext;

  beforeEach(() => {
    adapter = new MockDbAdapter({
      tables: {
        authors: [
          { id: 1, name: 'J.K. Rowling' },
          { id: 2, name: 'George R.R. Martin' },
        ],
        books: [
          { id: 101, title: 'Harry Potter 1', authorId: 1 },
          { id: 102, title: 'Harry Potter 2', authorId: 1 },
          { id: 201, title: 'A Game of Thrones', authorId: 2 },
        ],
      },
    });
    context = new LibraryContext({ adapter });
  });

  describe('DataLoaderBatcher', () => {
    it('batches multiple concurrent load calls into a single batch query', async () => {
      let callCount = 0;
      const batcher = new DataLoaderBatcher<number, string>(async keys => {
        callCount++;
        return keys.map(k => `val_${k}`);
      });

      const [r1, r2, r3] = await Promise.all([batcher.load(1), batcher.load(2), batcher.load(3)]);

      expect(r1).toBe('val_1');
      expect(r2).toBe('val_2');
      expect(r3).toBe('val_3');
      expect(callCount).toBe(1); // All 3 loaded in 1 single batch call
    });
  });

  describe('GraphQLSchemaBuilder', () => {
    it('generates SDL with types, queries, and mutations', () => {
      const builder = new GraphQLSchemaBuilder([Author, Book]);
      const sdl = builder.generateSdl();

      expect(sdl).toContain('type Author {');
      expect(sdl).toContain('id: ID!');
      expect(sdl).toContain('name: String!');
      expect(sdl).toContain('books: [Book!]!');

      expect(sdl).toContain('type Book {');
      expect(sdl).toContain('title: String!');
      expect(sdl).toContain('author: Author');

      expect(sdl).toContain('authors(skip: Int, limit: Int): [Author!]!');
      expect(sdl).toContain('author(id: ID!): Author');
      expect(sdl).toContain('createAuthor(input: CreateAuthorInput!): Author!');
      expect(sdl).toContain('deleteAuthor(id: ID!): Boolean!');
    });

    it('generates working query and mutation resolvers', async () => {
      const builder = new GraphQLSchemaBuilder([Author, Book]);
      const resolvers = builder.generateResolvers(context);

      // Query list
      const authors = await resolvers.Query.authors(null, { limit: 10 });
      expect(authors.length).toBe(2);

      // Query single by ID
      const author = await resolvers.Query.author(null, { id: 1 });
      expect(author?.name).toBe('J.K. Rowling');

      // Relationship resolver with DataLoader
      const booksResolver = resolvers.Author.books;
      const books = await booksResolver(author, null, null);
      expect(books.length).toBe(2);
      expect(books.map((b: any) => b.title)).toContain('Harry Potter 1');

      // Mutation create
      const newBook = await resolvers.Mutation.createBook(null, {
        input: { id: 301, title: 'The Hobbit', authorId: 1 },
      });
      expect(newBook.title).toBe('The Hobbit');

      // Mutation delete
      const deleted = await resolvers.Mutation.deleteBook(null, { id: 301 });
      expect(deleted).toBe(true);
    });
  });

  describe('TrpcRouterBuilder', () => {
    it('creates typed CRUD procedure handlers for an entity', async () => {
      const authorRouter = TrpcRouterBuilder.createEntityRouter(context, Author);

      // list
      const list = await authorRouter.list.resolve({ input: { limit: 5 } });
      expect(list.length).toBe(2);

      // byId
      const single = await authorRouter.byId.resolve({ input: { id: 2 } });
      expect(single?.name).toBe('George R.R. Martin');

      // create
      const created = await authorRouter.create.resolve({
        input: { id: 3, name: 'J.R.R. Tolkien' },
      });
      expect(created.name).toBe('J.R.R. Tolkien');

      // update
      const updated = await authorRouter.update.resolve({
        input: { id: 3, data: { name: 'John Ronald Reuel Tolkien' } },
      });
      expect(updated?.name).toBe('John Ronald Reuel Tolkien');

      // delete
      const delSuccess = await authorRouter.delete.resolve({ input: { id: 3 } });
      expect(delSuccess).toBe(true);
    });

    it('builds an aggregate app router for multiple entities', async () => {
      const appRouter = TrpcRouterBuilder.buildAppRouter(context, [Author, Book]);
      expect(appRouter.authors).toBeDefined();
      expect(appRouter.books).toBeDefined();

      const books = await appRouter.books.list.resolve({ input: {} });
      expect(books.length).toBe(3);
    });
  });
});
