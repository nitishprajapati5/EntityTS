import { DbContext } from '../context/DbContext';
import { MockDbAdapter } from '../adapters/MockDbAdapter';
import { ModelMetadataRegistry } from '../model/EntityMetadata';
import { EntityTarget } from '../set/DbSet';

export interface InMemoryContextOptions {
  /** Initial table data to populate */
  seedData?: Record<string, Record<string, unknown>[]>;
  /** Entity classes to auto-initialize tables for */
  entities?: EntityTarget[];
  /** Enable query logging */
  logging?: boolean;
}

/**
 * Lightweight, zero-setup in-memory DbContext for fast unit and integration testing.
 * Powered by `MockDbAdapter` with full in-memory SQL execution, query inspection,
 * and state reset capabilities.
 */
export class InMemoryContext extends DbContext {
  public readonly mockAdapter: MockDbAdapter;
  private readonly _initialSeed?: Record<string, Record<string, unknown>[]>;

  constructor(options?: InMemoryContextOptions) {
    const mockAdapter = new MockDbAdapter({ tables: options?.seedData });
    super({ adapter: mockAdapter, logging: options?.logging });
    this.mockAdapter = mockAdapter;
    this._initialSeed = options?.seedData
      ? JSON.parse(JSON.stringify(options.seedData))
      : undefined;

    // Auto-register tables for provided entities
    if (options?.entities) {
      for (const entity of options.entities) {
        const meta =
          typeof entity === 'function'
            ? ModelMetadataRegistry.getInstance().get(entity)
            : undefined;
        const tableName =
          meta?.tableName || (typeof entity === 'string' ? entity : (entity as any).name);
        if (tableName && !this.mockAdapter.getTableData(tableName).length) {
          this.mockAdapter.registerTable(tableName, []);
        }
      }
    }
  }

  /**
   * Directly seeds rows into an in-memory table.
   */
  public seedTable(tableName: string, rows: Record<string, unknown>[]): this {
    this.mockAdapter.registerTable(tableName, rows);
    return this;
  }

  /**
   * Retrieves all rows currently stored in the specified table.
   */
  public getTableRows(tableName: string): Record<string, unknown>[] {
    return this.mockAdapter.getTableData(tableName);
  }

  /**
   * Returns all queries executed against this test context.
   */
  public get executedQueries(): { sql: string; params?: any[] }[] {
    return this.mockAdapter.executedQueries;
  }

  /**
   * Clears the recorded executed queries list.
   */
  public clearExecutedQueries(): this {
    this.mockAdapter.executedQueries.length = 0;
    return this;
  }

  /**
   * Resets the in-memory database to its initial state or new seed data.
   */
  public reset(seedData?: Record<string, Record<string, unknown>[]>): this {
    this.clearExecutedQueries();
    this.changeTracker.clear();

    const dataToSeed = seedData || this._initialSeed || {};
    // Clear existing tables and re-seed
    for (const [table, rows] of Object.entries(dataToSeed)) {
      this.mockAdapter.registerTable(table, rows);
    }
    return this;
  }
}

/**
 * Creates an in-memory DbContext instance for testing.
 */
export function createTestContext(options?: InMemoryContextOptions): InMemoryContext {
  return new InMemoryContext(options);
}
