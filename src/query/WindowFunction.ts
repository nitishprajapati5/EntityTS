import { IDbAdapter } from '../adapters/IDbAdapter';

export class WindowSpecBuilder {
  private readonly _partitions: string[] = [];
  private readonly _orders: { column: string; direction: 'ASC' | 'DESC' }[] = [];
  private _frame?: string;

  public partitionBy(...columns: string[]): this {
    this._partitions.push(...columns);
    return this;
  }

  public orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this._orders.push({ column, direction });
    return this;
  }

  public orderByDescending(column: string): this {
    return this.orderBy(column, 'DESC');
  }

  public rowsBetween(start: string, end: string): this {
    this._frame = `ROWS BETWEEN ${start} AND ${end}`;
    return this;
  }

  public toSql(adapter?: IDbAdapter): string {
    const parts: string[] = [];
    if (this._partitions.length > 0) {
      const cols = adapter
        ? this._partitions.map(c => adapter.escapeIdentifier(c)).join(', ')
        : this._partitions.join(', ');
      parts.push(`PARTITION BY ${cols}`);
    }
    if (this._orders.length > 0) {
      const orders = adapter
        ? this._orders.map(o => `${adapter.escapeIdentifier(o.column)} ${o.direction}`).join(', ')
        : this._orders.map(o => `${o.column} ${o.direction}`).join(', ');
      parts.push(`ORDER BY ${orders}`);
    }
    if (this._frame) {
      parts.push(this._frame);
    }
    return `OVER (${parts.join(' ')})`;
  }
}

export class WindowFunctionExpression {
  private _alias?: string;
  private _windowSpec: WindowSpecBuilder = new WindowSpecBuilder();

  constructor(
    public readonly functionName: string,
    public readonly args: (string | number)[] = [],
  ) {}

  public over(fn?: (builder: WindowSpecBuilder) => void): this {
    if (fn) {
      fn(this._windowSpec);
    }
    return this;
  }

  public as(alias: string): this {
    this._alias = alias;
    return this;
  }

  public toSql(adapter?: IDbAdapter): string {
    const escapedArgs = this.args
      .map(a => {
        if (a === '*') return '*';
        return typeof a === 'string' && adapter ? adapter.escapeIdentifier(a) : String(a);
      })
      .join(', ');
    const fnSql = `${this.functionName}(${escapedArgs})`;
    const overSql = this._windowSpec.toSql(adapter);
    const aliasSql = this._alias
      ? ` AS ${adapter ? adapter.escapeIdentifier(this._alias) : this._alias}`
      : '';
    return `${fnSql} ${overSql}${aliasSql}`;
  }

  public toString(): string {
    return this.toSql();
  }
}

/**
 * Fluent builder for SQL window functions (ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, etc.)
 */
export class WindowFunction {
  public static rowNumber(): WindowFunctionExpression {
    return new WindowFunctionExpression('ROW_NUMBER');
  }

  public static rank(): WindowFunctionExpression {
    return new WindowFunctionExpression('RANK');
  }

  public static denseRank(): WindowFunctionExpression {
    return new WindowFunctionExpression('DENSE_RANK');
  }

  public static lag(column: string, offset = 1, defaultVal?: unknown): WindowFunctionExpression {
    const args: any[] = [column, offset];
    if (defaultVal !== undefined) args.push(defaultVal);
    return new WindowFunctionExpression('LAG', args);
  }

  public static lead(column: string, offset = 1, defaultVal?: unknown): WindowFunctionExpression {
    const args: any[] = [column, offset];
    if (defaultVal !== undefined) args.push(defaultVal);
    return new WindowFunctionExpression('LEAD', args);
  }

  public static firstValue(column: string): WindowFunctionExpression {
    return new WindowFunctionExpression('FIRST_VALUE', [column]);
  }

  public static lastValue(column: string): WindowFunctionExpression {
    return new WindowFunctionExpression('LAST_VALUE', [column]);
  }

  public static sum(column: string): WindowFunctionExpression {
    return new WindowFunctionExpression('SUM', [column]);
  }

  public static avg(column: string): WindowFunctionExpression {
    return new WindowFunctionExpression('AVG', [column]);
  }

  public static count(column: string = '*'): WindowFunctionExpression {
    return new WindowFunctionExpression('COUNT', [column]);
  }

  public static ntile(buckets: number): WindowFunctionExpression {
    return new WindowFunctionExpression('NTILE', [buckets]);
  }
}
