import { WindowFunction } from '../src/query/WindowFunction';
import { QueryBuilder } from '../src/query/QueryBuilder';
import { MockDbAdapter } from '../src/adapters/MockDbAdapter';
import { PostgresAdapter } from '../src/adapters/PostgresAdapter';
import { MysqlAdapter } from '../src/adapters/MysqlAdapter';
import { MssqlAdapter } from '../src/adapters/MssqlAdapter';
import { Table, PrimaryKey, Column } from '../src/decorators';
import { DbContext } from '../src/context/DbContext';

@Table('employees')
class Employee {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;

  @Column()
  dept!: string;

  @Column()
  salary!: number;
}

class CompanyContext extends DbContext {
  public readonly employees = this.set(Employee);
}

describe('Window Functions in QueryBuilder & DbSet', () => {
  let mockAdapter: MockDbAdapter;

  beforeEach(() => {
    mockAdapter = new MockDbAdapter({
      tables: {
        employees: [
          { id: 1, name: 'Alice', dept: 'Eng', salary: 120000 },
          { id: 2, name: 'Bob', dept: 'Eng', salary: 110000 },
          { id: 3, name: 'Charlie', dept: 'HR', salary: 90000 },
          { id: 4, name: 'Diana', dept: 'HR', salary: 95000 },
        ],
      },
    });
  });

  describe('Expression Builder', () => {
    it('builds ROW_NUMBER() with PARTITION BY and ORDER BY', () => {
      const expr = WindowFunction.rowNumber()
        .over(w => w.partitionBy('dept').orderBy('salary', 'DESC'))
        .as('dept_rank');

      const sql = expr.toSql();
      expect(sql).toBe('ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS dept_rank');
    });

    it('builds RANK() and DENSE_RANK()', () => {
      const rank = WindowFunction.rank()
        .over(w => w.orderBy('salary', 'DESC'))
        .as('r');
      expect(rank.toSql()).toBe('RANK() OVER (ORDER BY salary DESC) AS r');

      const dense = WindowFunction.denseRank()
        .over(w => w.orderBy('salary', 'DESC'))
        .as('dr');
      expect(dense.toSql()).toBe('DENSE_RANK() OVER (ORDER BY salary DESC) AS dr');
    });

    it('builds LAG() and LEAD() with offset and default value', () => {
      const lag = WindowFunction.lag('salary', 1, 0)
        .over(w => w.partitionBy('dept').orderBy('id', 'ASC'))
        .as('prev_salary');

      expect(lag.toSql()).toBe(
        'LAG(salary, 1, 0) OVER (PARTITION BY dept ORDER BY id ASC) AS prev_salary',
      );

      const lead = WindowFunction.lead('salary', 1)
        .over(w => w.orderBy('id', 'ASC'))
        .as('next_salary');

      expect(lead.toSql()).toBe('LEAD(salary, 1) OVER (ORDER BY id ASC) AS next_salary');
    });

    it('builds FIRST_VALUE() and LAST_VALUE()', () => {
      const fv = WindowFunction.firstValue('name')
        .over(w => w.partitionBy('dept').orderBy('salary', 'DESC'))
        .as('top_earner');
      expect(fv.toSql()).toBe(
        'FIRST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary DESC) AS top_earner',
      );

      const lv = WindowFunction.lastValue('name')
        .over(w => w.partitionBy('dept').orderBy('salary', 'DESC'))
        .as('lowest_earner');
      expect(lv.toSql()).toBe(
        'LAST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary DESC) AS lowest_earner',
      );
    });

    it('builds aggregate window functions (SUM OVER, AVG OVER, COUNT OVER)', () => {
      const sum = WindowFunction.sum('salary')
        .over(w => w.partitionBy('dept'))
        .as('dept_total');
      expect(sum.toSql()).toBe('SUM(salary) OVER (PARTITION BY dept) AS dept_total');

      const avg = WindowFunction.avg('salary')
        .over(w => w.partitionBy('dept'))
        .as('dept_avg');
      expect(avg.toSql()).toBe('AVG(salary) OVER (PARTITION BY dept) AS dept_avg');

      const count = WindowFunction.count('*')
        .over(w => w.partitionBy('dept'))
        .as('dept_count');
      expect(count.toSql()).toBe('COUNT(*) OVER (PARTITION BY dept) AS dept_count');
    });

    it('supports window framing ROWS BETWEEN ... AND ...', () => {
      const expr = WindowFunction.sum('salary')
        .over(w =>
          w.partitionBy('dept').orderBy('id').rowsBetween('UNBOUNDED PRECEDING', 'CURRENT ROW'),
        )
        .as('running_total');

      expect(expr.toSql()).toBe(
        'SUM(salary) OVER (PARTITION BY dept ORDER BY id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total',
      );
    });
  });

  describe('Dialect-Aware Escaping', () => {
    it('escapes identifiers for PostgreSQL with double quotes', () => {
      const pg = new PostgresAdapter('postgres://localhost/test');
      const expr = WindowFunction.rowNumber()
        .over(w => w.partitionBy('department').orderBy('salary', 'DESC'))
        .as('rank_num');

      const sql = expr.toSql(pg);
      expect(sql).toBe(
        'ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "rank_num"',
      );
    });

    it('escapes identifiers for MySQL with backticks', () => {
      const mysql = new MysqlAdapter('mysql://localhost/test');
      const expr = WindowFunction.rowNumber()
        .over(w => w.partitionBy('dept').orderBy('salary', 'DESC'))
        .as('r');

      const sql = expr.toSql(mysql);
      expect(sql).toBe('ROW_NUMBER() OVER (PARTITION BY `dept` ORDER BY `salary` DESC) AS `r`');
    });

    it('escapes identifiers for MSSQL with square brackets', () => {
      const mssql = new MssqlAdapter('Server=localhost;Database=mydb;');
      const expr = WindowFunction.rowNumber()
        .over(w => w.partitionBy('dept').orderBy('salary', 'DESC'))
        .as('r');

      const sql = expr.toSql(mssql);
      expect(sql).toBe('ROW_NUMBER() OVER (PARTITION BY [dept] ORDER BY [salary] DESC) AS [r]');
    });
  });

  describe('Integration with QueryBuilder and DbSet', () => {
    it('compiles in QueryBuilder.selectWindow()', () => {
      const qb = new QueryBuilder(mockAdapter, 'employees');
      qb.select('id', 'name').selectWindow(w =>
        w
          .rowNumber()
          .over(o => o.partitionBy('dept').orderBy('salary', 'DESC'))
          .as('rank_num'),
      );

      const sql = qb.toSql();
      expect(sql).toContain(
        'ROW_NUMBER() OVER (PARTITION BY "dept" ORDER BY "salary" DESC) AS "rank_num"',
      );
    });

    it('chains on DbSet via .selectWindow()', async () => {
      const ctx = new CompanyContext({ adapter: mockAdapter });
      const query = ctx.employees.selectWindow(w =>
        w
          .rowNumber()
          .over(o => o.partitionBy('dept').orderBy('salary', 'DESC'))
          .as('rank_num'),
      );

      const sql = query.toSql();
      expect(sql).toContain('ROW_NUMBER() OVER');
      expect(sql).toContain('AS "rank_num"');
    });
  });
});
