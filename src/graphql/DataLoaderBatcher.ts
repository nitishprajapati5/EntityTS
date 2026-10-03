/**
 * Lightweight in-memory batcher for GraphQL relationship resolvers.
 * Batches individual foreign-key requests across an event loop turn into a single batch query,
 * eliminating the N+1 query problem without requiring external dependencies.
 */
export class DataLoaderBatcher<K, V> {
  private _queue: { key: K; resolve: (val: V) => void; reject: (err: any) => void }[] = [];
  private _scheduled = false;

  constructor(private readonly batchFn: (keys: K[]) => Promise<(V | Error)[]>) {}

  /**
   * Queues a key to be loaded in the next batch.
   */
  public load(key: K): Promise<V> {
    return new Promise((resolve, reject) => {
      this._queue.push({ key, resolve, reject });
      if (!this._scheduled) {
        this._scheduled = true;
        process.nextTick(() => this.dispatch());
      }
    });
  }

  /**
   * Loads multiple keys in a single batch.
   */
  public async loadMany(keys: K[]): Promise<V[]> {
    return Promise.all(keys.map(k => this.load(k)));
  }

  private async dispatch(): Promise<void> {
    this._scheduled = false;
    const currentQueue = this._queue;
    this._queue = [];

    if (currentQueue.length === 0) return;

    const keys = currentQueue.map(q => q.key);
    try {
      const results = await this.batchFn(keys);
      for (let i = 0; i < currentQueue.length; i++) {
        const res = results[i];
        if (res instanceof Error) {
          currentQueue[i].reject(res);
        } else {
          currentQueue[i].resolve(res);
        }
      }
    } catch (err) {
      for (const q of currentQueue) {
        q.reject(err);
      }
    }
  }
}
