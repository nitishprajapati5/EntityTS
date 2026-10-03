import { ColumnKey, extractColumnName } from '../query/WhereClause';

/**
 * Fluent builder for specifying property updates in LINQ `executeUpdate` queries.
 *
 * Modeled after EF Core's `ExecuteUpdate` setter pattern, allowing type-safe assignments
 * using string column keys or strongly-typed lambda selectors `(e) => e.property`.
 *
 * @example
 * ```ts
 * await db.users
 *   .where(u => u.status, '=', 'inactive')
 *   .executeUpdate(s => s
 *     .set(u => u.status, 'archived')
 *     .set('retryCount', 0)
 *   );
 * ```
 */
export class UpdateSetBuilder<T = any> {
  private readonly _data: Record<string, unknown> = {};

  /**
   * Assigns a new value to an entity property or column.
   *
   * @param property - Property name key or lambda property selector `(e) => e.prop`.
   * @param value - The value to assign to the column.
   * @returns `this` builder instance for chaining.
   */
  public set<K extends ColumnKey<T>>(property: K | ((entity: T) => unknown), value: any): this {
    const col = extractColumnName(property);
    if (col) {
      this._data[col] = value;
    }
    return this;
  }

  /**
   * Returns the internal key-value mapping of updated properties.
   */
  public getData(): Record<string, unknown> {
    return { ...this._data };
  }
}
