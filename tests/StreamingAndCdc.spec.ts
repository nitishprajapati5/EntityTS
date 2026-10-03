import { Table, PrimaryKey, Column } from '../src/decorators';
import { DbContext } from '../src/context/DbContext';
import { MockDbAdapter } from '../src/adapters/MockDbAdapter';
import { CdcEmitter, CdcEvent } from '../src/realtime';
import { EntityEventBus } from '../src/events/EntityEventBus';

@Table('customers')
class Customer {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;

  @Column()
  active!: boolean;
}

class StoreContext extends DbContext {
  public readonly customers = this.set(Customer);
}

describe('Streaming and Real-time CDC Integration', () => {
  let adapter: MockDbAdapter;
  let context: StoreContext;

  beforeEach(() => {
    adapter = new MockDbAdapter({
      tables: {
        customers: [
          { id: 1, name: 'Alice', active: true },
          { id: 2, name: 'Bob', active: false },
          { id: 3, name: 'Charlie', active: true },
          { id: 4, name: 'Diana', active: true },
          { id: 5, name: 'Evan', active: false },
        ],
      },
    });
    context = new StoreContext({ adapter });
  });

  describe('AsyncIterator and Streaming', () => {
    it('supports direct for await ... of async iteration on DbSet', async () => {
      const activeCustomers: Customer[] = [];

      for await (const cust of context.customers.where({ active: true })) {
        activeCustomers.push(cust);
      }

      expect(activeCustomers.length).toBe(3);
      expect(activeCustomers.map(c => c.name)).toEqual(['Alice', 'Charlie', 'Diana']);
    });

    it('streams in small batch sizes without loading all records at once', async () => {
      const streamed: Customer[] = [];

      for await (const cust of context.customers.stream(2)) {
        streamed.push(cust);
      }

      expect(streamed.length).toBe(5);
      expect(streamed.map(c => c.id)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('CdcEmitter', () => {
    it('emits events to table-specific subscribers', async () => {
      const emitter = new CdcEmitter();
      const received: CdcEvent[] = [];

      const unsubscribe = emitter.on('customers', event => {
        received.push(event);
      });

      await emitter.publish({
        table: 'customers',
        operation: 'INSERT',
        after: { id: 6, name: 'Fiona', active: true },
        timestamp: new Date(),
      });

      // Different table event should not trigger 'customers' subscriber
      await emitter.publish({
        table: 'orders',
        operation: 'INSERT',
        after: { id: 101, amount: 50 },
        timestamp: new Date(),
      });

      expect(received.length).toBe(1);
      expect(received[0].after.name).toBe('Fiona');

      unsubscribe();
      await emitter.publish({
        table: 'customers',
        operation: 'UPDATE',
        after: { id: 6, name: 'Fiona Updated' },
        timestamp: new Date(),
      });
      // Should not receive after unsubscribe
      expect(received.length).toBe(1);
    });

    it('bridges CDC events to an EntityEventBus', async () => {
      const eventBus = new EntityEventBus();
      const emitter = new CdcEmitter(eventBus);

      const busEvents: any[] = [];
      eventBus.on('cdc:customers:insert', event => {
        busEvents.push(event);
      });

      await emitter.publish({
        table: 'customers',
        operation: 'INSERT',
        after: { id: 10, name: 'George' },
        timestamp: new Date(),
      });

      expect(busEvents.length).toBe(1);
      expect(busEvents[0].after.name).toBe('George');
    });

    it('parses PostgreSQL LISTEN/NOTIFY JSON payload', () => {
      const rawPayload = JSON.stringify({
        table: 'customers',
        action: 'UPDATE',
        old: { id: 1, name: 'Alice' },
        new: { id: 1, name: 'Alice Smith' },
        timestamp: '2026-05-01T12:00:00Z',
        tx_id: 'tx_998',
      });

      const parsed = CdcEmitter.parsePostgresPayload(rawPayload);
      expect(parsed).not.toBeNull();
      expect(parsed?.table).toBe('customers');
      expect(parsed?.operation).toBe('UPDATE');
      expect(parsed?.before.name).toBe('Alice');
      expect(parsed?.after.name).toBe('Alice Smith');
      expect(parsed?.txId).toBe('tx_998');
    });
  });
});
