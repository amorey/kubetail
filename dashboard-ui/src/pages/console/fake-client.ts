import type {
  Client,
  FetchOptions,
  FetchResult,
  LogRecord,
  SubscriptionCallback,
  SubscriptionCancelFunction,
  SubscriptionOptions,
} from './log-viewer';

const DEFAULT_LIMIT = 10;
const DEFAULT_APPEND_RATE = 0;
const INITIAL_LINES = 1000;
const DEFAULT_FETCH_DELAY_MS = 1000;

// type FakeFetchOptions = FetchOptions & {
//   fetchDelayMs: number;
// };

interface FakeFetchOptions extends FetchOptions {
  fetchDelayMs?: number;
}

/**
 * FakeClient - Represents a fake client
 */
export class FakeClient implements Client {
  private firstTS: number | undefined = undefined;

  private lastTS: number | undefined = undefined;

  private numLines: number;

  private timer: ReturnType<typeof setInterval> | null = null;

  private subscribers: Set<(record: LogRecord) => void> = new Set();

  private fetchDelayMs: number;

  /**
   * Constructor
   * @param initialLines - Initial number of lines (default: 1000)
   * @param rate - Lines per second append rate (default: 0)
   * @param fetchDelayMs - Delay in milliseconds for fetch operations (default: 1000ms)
   */
  constructor(
    initialLines: number = INITIAL_LINES,
    rate: number = DEFAULT_APPEND_RATE,
    fetchDelayMs: number = DEFAULT_FETCH_DELAY_MS,
  ) {
    if (initialLines > 0) {
      const now = new Date().getTime();
      this.firstTS = now - initialLines;
      this.lastTS = now - 1;
    }
    this.numLines = initialLines;
    this.fetchDelayMs = fetchDelayMs;
    this.setAppendRate(rate);
  }

  /**
   * fetchSince - Get the first `limit` log entries starting with `cursor`
   */
  async fetchSince({ cursor, limit = DEFAULT_LIMIT, fetchDelayMs = 0 }: FakeFetchOptions) {
    const ts = cursor ? Date.parse(cursor) : 0;

    return new Promise<FetchResult>((resolve) => {
      let records: LogRecord[];

      if (!this.firstTS || !this.lastTS) {
        records = [];
      } else {
        const startTS = Math.max(ts, this.firstTS);
        const stopTS = Math.min(this.lastTS + 1, startTS + limit);
        records = this.createRecords(startTS, stopTS);
      }

      const result = { records };
      setTimeout(resolve, fetchDelayMs || this.fetchDelayMs, result);
    });
  }

  /**
   * fetchUntil - Get the last `limit` log entries ending with the `cursor`
   */
  async fetchUntil({ cursor, limit = DEFAULT_LIMIT, fetchDelayMs = 0 }: FakeFetchOptions) {
    const ts = cursor ? Date.parse(cursor) : Infinity;

    return new Promise<FetchResult>((resolve) => {
      let records: LogRecord[];

      if (!this.firstTS || !this.lastTS) {
        records = [];
      } else {
        const stopTS = Math.min(ts + 1, this.lastTS + 1);
        const startTS = Math.max(this.firstTS, stopTS - limit);
        records = this.createRecords(startTS, stopTS);
      }

      const result = { records };
      setTimeout(resolve, fetchDelayMs || this.fetchDelayMs, result);
    });
  }

  /**
   * fetchAfter - Get the first `limit` log entries after `curosor`
   */
  async fetchAfter({ cursor, ...other }: FakeFetchOptions) {
    const newCursor = cursor ? new Date(Date.parse(cursor) + 1).toISOString() : undefined;
    return this.fetchSince({ cursor: newCursor, ...other });
  }

  /**
   * fetchBefore - Get the last `limit` log entries before `cursor`
   */
  async fetchBefore({ cursor, ...other }: FakeFetchOptions) {
    const newCursor = cursor ? new Date(Date.parse(cursor) - 1).toISOString() : undefined;
    return this.fetchSince({ cursor: newCursor, ...other });
  }

  /**
   * subscribe - Subscribe to new lines
   * @param callback - The function to call with every record
   * @param options - Subscription options
   * @returns cancel - The cancellation function
   */
  subscribe(callback: SubscriptionCallback, options?: SubscriptionOptions): SubscriptionCancelFunction {
    let sendToBuffer = options?.after !== undefined;
    const buffer: LogRecord[] = [];

    const cb = (record: LogRecord) => {
      if (sendToBuffer) buffer.push(record);
      else callback(record);
    };

    this.subscribers.add(cb);

    if (sendToBuffer) {
      (async () => {
        const result = await this.fetchAfter({ cursor: options?.after, limit: Infinity, fetchDelayMs: 0 });

        // Write results to callback
        let lastTS = new Date(0);
        result.records.forEach((record) => {
          callback(record);
          lastTS = record.timestamp;
        });

        // Empty buffer
        while (buffer.length > 0) {
          const record = buffer.shift();
          if (record && record.timestamp > lastTS) callback(record);
        }

        // Update flag
        sendToBuffer = false;
      })();
    }

    return () => {
      this.subscribers.delete(cb);
    };
  }

  /**
   * setAppendRate - Set append rate
   */
  setAppendRate(rate: number): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (rate > 0) {
      // Use a reasonable interval (100ms min) and batch lines accordingly
      // Larger intervals reduce timer overhead at high rates
      const intervalMs = Math.max(100, 1000 / rate);
      const linesPerTick = Math.max(1, Math.round((rate * intervalMs) / 1000));

      this.timer = setInterval(() => {
        if (!this.firstTS || !this.lastTS) {
          const now = new Date().getTime();
          this.firstTS = now;
          this.lastTS = now;
        }

        // Optimize: skip expensive operations if no subscribers
        if (this.subscribers.size > 0) {
          for (let i = 0; i < linesPerTick; i += 1) {
            this.numLines += 1;
            this.lastTS += 1;
            this.notify(this.createRecord(this.lastTS));
          }
        } else {
          // Just increment the count without creating strings or notifying
          this.numLines += linesPerTick;
          this.lastTS += linesPerTick;
        }
      }, intervalMs);
    }
  }

  /**
   * getLineCount - Return total number of lines
   */
  getLineCount(): number {
    return this.numLines;
  }

  /**
   * notify - Send message to subscribers
   */
  protected notify(record: LogRecord): void {
    this.subscribers.forEach((callback) => callback(record));
  }

  /**
   * createRecord - Helper method to generate a record from a timestamp
   */
  protected createRecord(ts: number): LogRecord {
    const firstTS = this.firstTS || 0;
    const timestamp = new Date(ts);
    return {
      timestamp,
      message: `line ${ts - firstTS}`,
      cursor: timestamp.toISOString(),
    };
  }

  /**
   * createRecords - Helper method to generate a list of LogRecords
   *                 from start/stop timestamps.
   */
  protected createRecords(startTS: number, stopTS: number): LogRecord[] {
    return Array.from({ length: stopTS - startTS }, (_, i) => this.createRecord(startTS + i));
  }
}
