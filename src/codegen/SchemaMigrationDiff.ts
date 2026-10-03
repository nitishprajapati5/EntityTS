import { IDbAdapter } from '../adapters/IDbAdapter';
import { MigrationBuilder } from '../migrations/MigrationBuilder';
import { MigrationModule } from '../migrations/MigrationRunner';
import { EntityMetadata } from '../model/EntityMetadata';
import { sqlTypeToColumnType } from './EntityToMigrationBuilder';

export type ColumnChangeType =
  'added' | 'removed' | 'type_changed' | 'nullable_changed' | 'renamed';

export interface ColumnDiffDetail {
  table: string;
  columnName: string;
  changeType: ColumnChangeType;
  oldType?: string;
  newType?: string;
  oldNullable?: boolean;
  newNullable?: boolean;
}

export interface DetailedSchemaDiff {
  missingTables: string[];
  extraTables: string[];
  columnDiffs: Array<{
    table: string;
    missingColumns: string[];
    extraColumns: string[];
    modifiedColumns?: ColumnDiffDetail[];
  }>;
  modifiedColumns: ColumnDiffDetail[];
  hasChanges: boolean;
}

/**
 * Builds migration statements from a detailed schema diff.
 */
export class SchemaMigrationDiff {
  /**
   * Generates up and down statements from a DetailedSchemaDiff
   */
  public static generateStatements(
    diff: DetailedSchemaDiff,
    entityMetas: EntityMetadata[],
    adapter: IDbAdapter,
  ): { up: string[]; down: string[] } {
    const up: string[] = [];
    const down: string[] = [];

    // 1. Missing tables
    for (const tableName of diff.missingTables) {
      const meta = entityMetas.find(m => m.tableName.toLowerCase() === tableName.toLowerCase());
      if (!meta || meta.isView) continue;
      // CREATE TABLE
      up.push(`  // Create table ${tableName}`);
      up.push(`  await schema.createTable('${tableName}', t => {`);
      for (const col of meta.columns.values()) {
        if (col.isPrimaryKey) {
          if (col.isAutoIncrement) {
            up.push(`    t.increments('${col.columnName}').primary();`);
          } else {
            const cType = sqlTypeToColumnType(col.sqlType, adapter, col.maxLength);
            up.push(`    t.string('${col.columnName}').primary(); // ${cType}`);
          }
        } else {
          const cType = sqlTypeToColumnType(col.sqlType, adapter, col.maxLength);
          const nullStr = col.isNullable ? '.nullable()' : '.notNullable()';
          up.push(`    t.string('${col.columnName}')${nullStr}; // ${cType}`);
        }
      }
      up.push(`  });`);
      down.push(`  await schema.dropTableIfExists('${tableName}');`);
    }

    // 2. Column additions
    for (const tableDiff of diff.columnDiffs) {
      const meta = entityMetas.find(
        m => m.tableName.toLowerCase() === tableDiff.table.toLowerCase(),
      );
      for (const colName of tableDiff.missingColumns) {
        const col = meta
          ? Array.from(meta.columns.values()).find(
              c => c.columnName.toLowerCase() === colName.toLowerCase(),
            )
          : undefined;
        const colType = col
          ? sqlTypeToColumnType(col.sqlType, adapter, col.maxLength)
          : 'VARCHAR(255)';
        up.push(`  schema.addColumn('${tableDiff.table}', '${colName}', '${colType}');`);
        down.push(`  schema.dropColumn('${tableDiff.table}', '${colName}');`);
      }

      // Column modifications (type or nullability)
      if (tableDiff.modifiedColumns) {
        for (const mod of tableDiff.modifiedColumns) {
          if (mod.changeType === 'type_changed' && mod.newType) {
            up.push(`  schema.alterColumn('${mod.table}', '${mod.columnName}', '${mod.newType}');`);
            if (mod.oldType) {
              down.push(
                `  schema.alterColumn('${mod.table}', '${mod.columnName}', '${mod.oldType}');`,
              );
            }
          } else if (mod.changeType === 'nullable_changed') {
            const nullStr = mod.newNullable ? 'NULL' : 'NOT NULL';
            const oldNullStr = mod.oldNullable ? 'NULL' : 'NOT NULL';
            up.push(
              `  schema.alterColumn('${mod.table}', '${mod.columnName}', '${mod.newType || 'VARCHAR(255)'} ${nullStr}');`,
            );
            down.push(
              `  schema.alterColumn('${mod.table}', '${mod.columnName}', '${mod.oldType || 'VARCHAR(255)'} ${oldNullStr}');`,
            );
          }
        }
      }
    }

    return { up, down };
  }

  /**
   * Squashes multiple migration modules into a single consolidated migration module.
   */
  public static squashMigrations(
    migrations: MigrationModule[],
    squashedName: string = 'SquashedBaseline',
  ): MigrationModule {
    const timestamp = Date.now().toString();

    return {
      id: timestamp,
      name: squashedName,
      up: async (schema: MigrationBuilder) => {
        for (const migration of migrations) {
          await migration.up(schema);
        }
      },
      down: async (schema: MigrationBuilder) => {
        // Rollback in reverse order
        for (let i = migrations.length - 1; i >= 0; i--) {
          await migrations[i].down(schema);
        }
      },
    };
  }
}
