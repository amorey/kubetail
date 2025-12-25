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
   * fetchSince - Get the first `count` log entries starting with timestamp `ts`
   * @param ts - The timestamp to start at (inclusive)
   * @param count - The number of entries to fetch
   */
  async fetchSince(ts: number, count: number, fetchDelayMs?: number): Promise<FetchResult> {
    return new Promise<FetchResult>((resolve) => {
      let records: LogRecord[];

      if (!this.firstTS || !this.lastTS) {
        records = [];
      } else {
        const startTS = Math.max(ts, this.firstTS);
        const stopTS = Math.min(this.lastTS + 1, startTS + count);
        records = this.createRecords(startTS, stopTS);
      }

      const result = { records };
      setTimeout(resolve, fetchDelayMs || this.fetchDelayMs, result);
    });
  }

  /**
   * fetchUntil - Get the last `count` log entries until timestamp `ts`
   * @param idx - The timestamp to end at (inclusive)
   * @param count - The number of entries to fetch
   */
  async fetchUntil(ts: number, count: number, fetchDelayMs?: number): Promise<FetchResult> {
    return new Promise<FetchResult>((resolve) => {
      let records: LogRecord[];

      if (!this.firstTS || !this.lastTS) {
        records = [];
      } else {
        const stopTS = Math.min(ts + 1, this.lastTS + 1);
        const startTS = Math.max(this.firstTS, stopTS - count);
        records = this.createRecords(startTS, stopTS);
      }

      const result = { records };
      setTimeout(resolve, fetchDelayMs || this.fetchDelayMs, result);
    });
  }

  /**
   * fetchAfter - Get the first `count` log entries after timestamp `ts`
   * @param idx - The timestamp to start after (exclusive)
   * @param count - The number of entries to fetch
   */
  async fetchAfter(ts: number, count: number, fetchDelayMs?: number): Promise<FetchResult> {
    return this.fetchSince(ts + 1, count, fetchDelayMs);
  }

  /**
   * fetchBefore - Get the last `count` log entries before timestamp `ts`
   * Returns entries in increasing order: [idx-count, idx-count+1, ..., idx-1]
   * @param ts - The timestamp to end before (exclusive)
   * @param count - The number of entries to fetch
   */
  async fetchBefore(ts: number, count: number, fetchDelayMs?: number): Promise<FetchResult> {
    return this.fetchUntil(ts - 1, count, fetchDelayMs);
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
        const result = await this.fetchAfter(options?.after || 0, Infinity, 0);

        // Write results to callback
        let lastTS = 0;
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
    return {
      timestamp: ts,
      message: `line ${ts - firstTS}`,
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
