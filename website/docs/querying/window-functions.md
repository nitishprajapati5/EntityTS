---
id: window-functions
title: Window Functions
sidebar_position: 5
---

# SQL Window Functions

EntityTS provides first-class support for compiling SQL window functions directly within your queries using `WindowFunction` and `selectWindow`.

Window functions allow you to perform calculations across a set of table rows that are related to the current row, without collapsing the individual rows into a single grouping.

---

## Supported Window Functions

| Function                                       | Description                                                    |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `WindowFunction.rowNumber()`                   | Assigns a sequential unique integer to each row starting at 1  |
| `WindowFunction.rank()`                        | Assigns rank with gaps for ties                                |
| `WindowFunction.denseRank()`                   | Assigns rank without gaps for ties                             |
| `WindowFunction.lead(column, offset, default)` | Accesses data from a subsequent row at a given physical offset |
| `WindowFunction.lag(column, offset, default)`  | Accesses data from a prior row at a given physical offset      |
| `WindowFunction.firstValue(column)`            | Returns the value from the first row of the window frame       |
| `WindowFunction.lastValue(column)`             | Returns the value from the last row of the window frame        |
| `WindowFunction.sum(column)`                   | Calculates running or partitioned sum                          |
| `WindowFunction.avg(column)`                   | Calculates running or partitioned average                      |
| `WindowFunction.count(column)`                 | Calculates running or partitioned count                        |
| `WindowFunction.ntile(buckets)`                | Divides partition into a specified number of ranked groups     |

---

## Partitioning and Ordering

Window functions define their scope using the `OVER` clause, configured via the fluent `WindowSpecBuilder`:

- `.partitionBy(...columns)`: Divides the query results into partitions.
- `.orderBy(column, 'ASC' | 'DESC')` or `.orderByDescending(column)`: Specifies the sort order inside each partition.
- `.rowsBetween(start, end)`: Configures window framing (e.g. `UNBOUNDED PRECEDING AND CURRENT ROW`).
- `.as(alias)`: Gives an alias to the resulting calculated column.

---

## Code Examples

### Calculating Row Numbers within Departments

```ts
import { WindowFunction } from 'entityts';

const employees = await db.employees
  .createQueryBuilder()
  .select('id', 'name', 'department', 'salary')
  .selectWindow(w =>
    w
      .rowNumber()
      .over(spec => spec.partitionBy('department').orderBy('salary', 'DESC'))
      .as('deptRank'),
  )
  .toList();
```

Generated SQL (PostgreSQL / MSSQL / MySQL):

```sql
SELECT "id", "name", "department", "salary",
       ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY "salary" DESC) AS "deptRank"
FROM "employees"
```

### Running Totals with Cumulative SUM

```ts
const transactions = await db.transactions
  .createQueryBuilder()
  .select('id', 'accountId', 'amount', 'createdAt')
  .selectWindow(w =>
    w
      .sum('amount')
      .over(spec =>
        spec
          .partitionBy('accountId')
          .orderBy('createdAt', 'ASC')
          .rowsBetween('UNBOUNDED PRECEDING', 'CURRENT ROW'),
      )
      .as('runningBalance'),
  )
  .toList();
```

### Comparing with Previous Rows Using LAG

```ts
const revenueGrowth = await db.monthlySales
  .createQueryBuilder()
  .select('month', 'revenue')
  .selectWindow(w =>
    w
      .lag('revenue', 1, 0)
      .over(spec => spec.orderBy('month', 'ASC'))
      .as('previousMonthRevenue'),
  )
  .toList();
```
