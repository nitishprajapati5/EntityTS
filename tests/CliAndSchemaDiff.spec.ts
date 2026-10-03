import { SchemaGenerator, SchemaMigrationDiff } from '../src/codegen';
import { MockDbAdapter } from '../src/adapters/MockDbAdapter';
import { MigrationBuilder } from '../src/migrations/MigrationBuilder';
import { Table, PrimaryKey, Column } from '../src/decorators';
import { ModelMetadataRegistry } from '../src/model/EntityMetadata';
import { MigrationModule } from '../src/migrations/MigrationRunner';

@Table('users')
class UserEntity {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  email?: string;
}

@Table('orders')
class OrderEntity {
  @PrimaryKey()
  id!: number;

  @Column()
  amount!: number;
}

describe('Column-Level Schema Diffing & Migration Tooling', () => {
  let adapter: MockDbAdapter;

  beforeEach(() => {
    adapter = new MockDbAdapter();
  });

  describe('SchemaMigrationDiff', () => {
    it('generates up and down statements from detailed schema diff', () => {
      const meta = ModelMetadataRegistry.getInstance().get(UserEntity)!;
      const statements = SchemaMigrationDiff.generateStatements(
        {
          missingTables: ['users'],
          extraTables: [],
          columnDiffs: [
            {
              table: 'users',
              missingColumns: ['phone'],
              extraColumns: [],
              modifiedColumns: [
                {
                  table: 'users',
                  columnName: 'email',
                  changeType: 'type_changed',
                  oldType: 'VARCHAR(100)',
                  newType: 'VARCHAR(255)',
                },
              ],
            },
          ],
          modifiedColumns: [],
          hasChanges: true,
        },
        [meta],
        adapter,
      );

      expect(statements.up.some(s => s.includes('createTable'))).toBe(true);
      expect(statements.up.some(s => s.includes('addColumn'))).toBe(true);
      expect(statements.up.some(s => s.includes('alterColumn'))).toBe(true);
      expect(statements.down.some(s => s.includes('dropTableIfExists'))).toBe(true);
      expect(statements.down.some(s => s.includes('dropColumn'))).toBe(true);
    });

    it('squashes multiple migrations into a single consolidated baseline migration', async () => {
      const mig1: MigrationModule = {
        id: '1',
        name: 'CreateUsers',
        up: schema => {
          schema.createTable('users', t => {
            t.increments('id').primary();
            t.string('name');
          });
        },
        down: schema => {
          schema.dropTable('users');
        },
      };

      const mig2: MigrationModule = {
        id: '2',
        name: 'AddEmail',
        up: schema => {
          schema.addColumn('users', 'email', 'VARCHAR(255)');
        },
        down: schema => {
          schema.dropColumn('users', 'email');
        },
      };

      const squashed = SchemaMigrationDiff.squashMigrations([mig1, mig2], 'InitBaseline');
      expect(squashed.name).toBe('InitBaseline');
      expect(typeof squashed.up).toBe('function');
      expect(typeof squashed.down).toBe('function');

      const builderUp = new MigrationBuilder();
      await squashed.up(builderUp);
      const sqlUp = builderUp.getSqlStatements(adapter);
      expect(sqlUp.length).toBe(2);

      const builderDown = new MigrationBuilder();
      await squashed.down(builderDown);
      const sqlDown = builderDown.getSqlStatements(adapter);
      // Down migrations should be executed in reverse order
      expect(sqlDown.length).toBe(2);
      expect(sqlDown[0]).toContain('DROP COLUMN');
      expect(sqlDown[1]).toContain('DROP TABLE');
    });
  });

  describe('SchemaGenerator diffDetailed', () => {
    it('detects missing tables and hasChanges correctly', async () => {
      const generator = new SchemaGenerator(adapter, [UserEntity, OrderEntity]);
      const diff = await generator.diffDetailed();

      expect(diff.hasChanges).toBe(true);
      expect(diff.missingTables).toContain('users');
      expect(diff.missingTables).toContain('orders');
    });

    it('squashes migrations via SchemaGenerator instance method', async () => {
      const generator = new SchemaGenerator(adapter, [UserEntity]);
      const m1: MigrationModule = {
        id: '1',
        name: 'M1',
        up: s => {
          s.executeSql('SELECT 1;');
        },
        down: s => {
          s.executeSql('SELECT 2;');
        },
      };
      const squashed = generator.squash([m1]);
      expect(squashed.name).toBe('SquashedBaseline');
    });
  });
});
