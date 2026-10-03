import { DbSet } from '../set/DbSet';
import { QueryBuilder } from '../query/QueryBuilder';

export interface SqlQueryResult {
  sql: string;
  params: any[];
}

/**
 * Custom assertions for testing SQL generation and parameter bindings.
 */
export class SqlAssertions {
  private readonly _sql: string;
  private readonly _params: any[];

  constructor(
    target:
      | DbSet<any>
      | QueryBuilder<any>
      | { toSelectSql: () => SqlQueryResult }
      | SqlQueryResult
      | string,
  ) {
    if (typeof target === 'string') {
      this._sql = target;
      this._params = [];
    } else if ('toSelectSql' in target && typeof target.toSelectSql === 'function') {
      const res = target.toSelectSql();
      this._sql = res.sql;
      this._params = res.params || [];
    } else if ('sql' in target) {
      this._sql = target.sql;
      this._params = target.params || [];
    } else {
      this._sql = String(target);
      this._params = [];
    }
  }

  public get sql(): string {
    return this._sql;
  }

  public get params(): any[] {
    return this._params;
  }

  /**
   * Asserts that the generated SQL exactly equals the expected SQL string (normalizing whitespace).
   */
  public toSQL(expectedSql: string): this {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const actualNorm = normalize(this._sql);
    const expectedNorm = normalize(expectedSql);

    if (actualNorm !== expectedNorm) {
      throw new Error(`Expected SQL:\n  "${expectedNorm}"\nReceived SQL:\n  "${actualNorm}"`);
    }
    return this;
  }

  /**
   * Asserts that the generated SQL contains the given fragment.
   */
  public toContainSql(fragment: string): this {
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const actualNorm = normalize(this._sql);
    const fragNorm = normalize(fragment);

    if (!actualNorm.includes(fragNorm)) {
      throw new Error(`Expected SQL to contain "${fragNorm}", but got:\n  "${actualNorm}"`);
    }
    return this;
  }

  /**
   * Asserts that the generated query params match the expected parameter array or values.
   */
  public toMatchParams(expectedParams: any[]): this {
    if (this._params.length !== expectedParams.length) {
      throw new Error(
        `Expected ${expectedParams.length} params, but got ${this._params.length} (${JSON.stringify(this._params)})`,
      );
    }
    for (let i = 0; i < expectedParams.length; i++) {
      const exp = expectedParams[i];
      const act = this._params[i]?.value !== undefined ? this._params[i].value : this._params[i];
      if (exp !== act) {
        throw new Error(
          `Parameter mismatch at index ${i}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`,
        );
      }
    }
    return this;
  }
}

/**
 * Creates an `SqlAssertions` wrapper for query verification.
 */
export function expectQuery(
  query:
    | DbSet<any>
    | QueryBuilder<any>
    | { toSelectSql: () => SqlQueryResult }
    | SqlQueryResult
    | string,
): SqlAssertions {
  return new SqlAssertions(query);
}
