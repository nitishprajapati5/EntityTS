import { EntityEventBus } from '../events/EntityEventBus';

export type CdcOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface CdcEvent<T = any> {
  table: string;
  operation: CdcOperation;
  before?: T;
  after?: T;
  timestamp: Date;
  txId?: string;
}

export interface CdcSubscriptionFilter {
  table?: string;
  operation?: CdcOperation;
}

export type CdcHandler<T = any> = (event: CdcEvent<T>) => Promise<void> | void;

/**
 * Change Data Capture (CDC) emitter and subscriber.
 *
 * Bridges database real-time notifications (PostgreSQL LISTEN/NOTIFY, MySQL binlog triggers, MSSQL CDC)
 * to in-process event handlers and EntityEventBus instances.
 */
export class CdcEmitter {
  private readonly _handlers: Array<{
    filter: CdcSubscriptionFilter;
    handler: CdcHandler;
  }> = [];

  constructor(public readonly eventBus?: EntityEventBus) {}

  /**
   * Publishes a Change Data Capture event to all matching subscribers
   * and optionally bridges it to an attached EntityEventBus.
   */
  public async publish<T = any>(event: CdcEvent<T>): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const sub of this._handlers) {
      const matchTable =
        !sub.filter.table || sub.filter.table === '*' || sub.filter.table === event.table;
      const matchOp = !sub.filter.operation || sub.filter.operation === event.operation;

      if (matchTable && matchOp) {
        const res = sub.handler(event);
        if (res instanceof Promise) promises.push(res);
      }
    }

    if (this.eventBus) {
      const opLower = event.operation.toLowerCase();
      promises.push(this.eventBus.publish(`cdc:${event.table}:${opLower}`, event));
      promises.push(this.eventBus.publish(`cdc:*:${opLower}`, event));
    }

    await Promise.all(promises);
  }

  /**
   * Subscribes to CDC events matching a filter object or table name.
   * Returns an unsubscribe function.
   */
  public subscribe<T = any>(
    filterOrTable: CdcSubscriptionFilter | string,
    handler: CdcHandler<T>,
  ): () => void {
    const filter: CdcSubscriptionFilter =
      typeof filterOrTable === 'string' ? { table: filterOrTable } : filterOrTable;

    const entry = { filter, handler: handler as CdcHandler };
    this._handlers.push(entry);

    return () => {
      const idx = this._handlers.indexOf(entry);
      if (idx !== -1) this._handlers.splice(idx, 1);
    };
  }

  /**
   * Subscribes to events for a specific table name.
   */
  public on<T = any>(table: string, handler: CdcHandler<T>): () => void {
    return this.subscribe({ table }, handler);
  }

  /**
   * Helper that parses a PostgreSQL LISTEN/NOTIFY JSON payload into a typed CdcEvent.
   */
  public static parsePostgresPayload(rawPayload: string): CdcEvent | null {
    try {
      const parsed = JSON.parse(rawPayload);
      return {
        table: parsed.table || parsed.schema_table,
        operation: (parsed.action || parsed.operation || 'INSERT').toUpperCase() as CdcOperation,
        before: parsed.old || parsed.before,
        after: parsed.new || parsed.after || parsed.data,
        timestamp: parsed.timestamp ? new Date(parsed.timestamp) : new Date(),
        txId: parsed.tx_id || parsed.txId,
      };
    } catch {
      return null;
    }
  }
}
