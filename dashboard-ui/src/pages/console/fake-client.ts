import type {
  Client,
  FetchResult,
  LogRecord,
  SubscriptionCallback,
  SubscriptionCancelFunction,
  SubscriptionOptions,
} from './log-viewer';

const DEFAULT_APPEND_RATE = 0;
const INITIAL_LINES = 1000;
const DEFAULT_FETCH_DELAY_MS = 1000;

/**
 * FakeClient - Represents a fake client
 */
export class FakeClient implements Client {
  private firstTS: Date | undefined = undefined;

  private lastTS: Date | undefined = undefined;

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
      this.firstTS = new Date(now - initialLines);
      this.lastTS = new Date(now - 1);
    }
    this.numLines = initialLines;
    this.fetchDelayMs = fetchDelayMs;
    this.setAppendRate(rate);
  }

  /**
   * fetchSince - Get the first `count` log entries starting with timestamp `ts`
   * @param ts - The timestamp to start at (inclusive)
   * @param limit - The maximum number of entries to fetch
   */
  async fetchSince(ts: Date, limit: number, fetchDelayMs?: number) {
    return new Promise<FetchResult>((resolve) => {
      let records: LogRecord[];

      if (!this.firstTS || !this.lastTS) {
        records = [];
      } else {
        const startTS = Math.max(ts.getTime(), this.firstTS.getTime());
        const stopTS = Math.min(this.lastTS.getTime() + 1, startTS + limit);
        records = this.createRecords(startTS, stopTS);
      }

      const result = { records };
      setTimeout(resolve, fetchDelayMs || this.fetchDelayMs, result);
    });
  }

  /**
   * fetchUntil - Get the last `count` log entries until timestamp `ts`
   * @param ts - The timestamp to end at (inclusive)
   * @param limit - The maximum number of entries to fetch
   */
  async fetchUntil(ts: Date, count: number, fetchDelayMs?: number) {
    return new Promise<FetchResult>((resolve) => {
      let records: LogRecord[];

      if (!this.firstTS || !this.lastTS) {
        records = [];
      } else {
        const stopTS = Math.min(ts.getTime() + 1, this.lastTS.getTime() + 1);
        const startTS = Math.max(this.firstTS.getTime(), stopTS - count);
        records = this.createRecords(startTS, stopTS);
      }

      const result = { records };
      setTimeout(resolve, fetchDelayMs || this.fetchDelayMs, result);
    });
  }

  /**
   * fetchAfter - Get the first `count` log entries after timestamp `ts`
   * @param ts - The timestamp to start after (exclusive)
   * @param limit - The maximum number of entries to fetch
   */
  async fetchAfter(ts: Date, limit: number, fetchDelayMs?: number) {
    return this.fetchSince(new Date(ts.getTime() + 1), limit, fetchDelayMs);
  }

  /**
   * fetchBefore - Get the last `count` log entries before timestamp `ts`
   * Returns entries in increasing order: [idx-count, idx-count+1, ..., idx-1]
   * @param ts - The timestamp to end before (exclusive)
   * @param limit - The maximum number of entries to fetch
   */
  async fetchBefore(ts: Date, limit: number, fetchDelayMs?: number) {
    return this.fetchUntil(new Date(ts.getTime() - 1), limit, fetchDelayMs);
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
        const result = await this.fetchAfter(options?.after || new Date(0), Infinity, 0);

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
          const now = new Date();
          this.firstTS = now;
          this.lastTS = now;
        }

        // Optimize: skip expensive operations if no subscribers
        if (this.subscribers.size > 0) {
          for (let i = 0; i < linesPerTick; i += 1) {
            this.numLines += 1;
            this.lastTS = new Date(this.lastTS.getTime() + 1);
            this.notify(this.createRecord(this.lastTS.getTime()));
          }
        } else {
          // Just increment the count without creating strings or notifying
          this.numLines += linesPerTick;
          this.lastTS = new Date(this.lastTS.getTime() + linesPerTick);
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
    const firstTS = this.firstTS || new Date(0);
    return {
      timestamp: new Date(ts),
      message: `line ${ts - firstTS.getTime()}`,
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
