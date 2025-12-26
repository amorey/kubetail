import type { ApolloClient } from '@apollo/client';

import { LogRecord as ServerLogRecord, LogRecordsQueryMode } from '@/lib/graphql/dashboard/__generated__/graphql';
import { LOG_RECORDS_FETCH, LOG_RECORDS_FOLLOW } from '@/lib/graphql/dashboard/ops';

import type {
  Client,
  FetchOptions,
  LogRecord,
  SubscriptionCallback,
  SubscriptionCancelFunction,
  SubscriptionOptions,
} from './log-viewer';

/**
 * createRecord - Create LogRecord from server response item
 */

function createRecord(item: ServerLogRecord): LogRecord {
  const ts = new Date(item.timestamp);
  return {
    timestamp: ts,
    message: item.message,
    cursor: item.timestamp,
  };
}

/**
 * RealClient - Represents a real client
 */

export class RealClient implements Client {
  private apolloClient: ApolloClient;

  /**
   * Constructor
   * @param apolloClient - Apollo client instance
   */
  constructor(apolloClient: ApolloClient) {
    this.apolloClient = apolloClient;
  }

  /**
   * fetchSince - Get the first `limit` log entries starting with `cursor`
   * @param options - Fetch options
   * @returns A promise that resolves to the fetch result
   */
  async fetchSince(options: FetchOptions) {
    const result = await this.apolloClient.query({
      query: LOG_RECORDS_FETCH,
      variables: {
        kubeContext: '',
        sources: ['deployments/loggen-ansi'],
        since: options.cursor,
        limit: options.limit,
        mode: LogRecordsQueryMode.Head,
      },
      fetchPolicy: 'no-cache',
    });

    return { records: (result.data?.logRecordsFetch?.records || []).map(createRecord) };
  }

  /**
   * fetchUntil - Get the last `limit` log entries ending with the `cursor`
   * @param options - Fetch options
   * @returns A promise that resolves to the fetch result
   */
  async fetchUntil(options: FetchOptions) {
    const result = await this.apolloClient.query({
      query: LOG_RECORDS_FETCH,
      variables: {
        kubeContext: '',
        sources: ['deployments/loggen-ansi'],
        until: options.cursor,
        limit: options.limit,
        mode: LogRecordsQueryMode.Tail,
      },
      fetchPolicy: 'no-cache',
    });

    return { records: (result.data?.logRecordsFetch?.records || []).map(createRecord) };
  }

  /**
   * fetchAfter - Get the first `limit` log entries after `curosor`
   * @param options - Fetch options
   * @returns A promise that resolves to the fetch result
   */
  async fetchAfter(options: FetchOptions) {
    const result = await this.apolloClient.query({
      query: LOG_RECORDS_FETCH,
      variables: {
        kubeContext: '',
        sources: ['deployments/loggen-ansi'],
        after: options.cursor,
        limit: options.limit,
        mode: LogRecordsQueryMode.Head,
      },
      fetchPolicy: 'no-cache',
    });

    return { records: (result.data?.logRecordsFetch?.records || []).map(createRecord) };
  }

  /**
   * fetchBefore - Get the last `limit` log entries before `cursor`
   * @param options - Fetch options
   * @returns A promise that resolves to the fetch result
   */
  async fetchBefore(options: FetchOptions) {
    const result = await this.apolloClient.query({
      query: LOG_RECORDS_FETCH,
      variables: {
        kubeContext: '',
        sources: ['deployments/loggen-ansi'],
        before: options.cursor,
        limit: options.limit,
        mode: LogRecordsQueryMode.Tail,
      },
      fetchPolicy: 'no-cache',
    });

    return { records: (result.data?.logRecordsFetch?.records || []).map(createRecord) };
  }

  /**
   * subscribe - Subscribe to new lines
   * @param callback - The function to call with every record
   * @param options - Subscription options
   * @returns cancel - The cancellation function
   */
  subscribe(callback: SubscriptionCallback, options?: SubscriptionOptions): SubscriptionCancelFunction {
    const observable = this.apolloClient.subscribe({
      query: LOG_RECORDS_FOLLOW,
      variables: {
        kubeContext: '',
        sources: ['deployments/loggen-ansi'],
        after: options?.after,
      },
    });

    const subscription = observable.subscribe({
      next({ data }) {
        if (data?.logRecordsFollow) callback(createRecord(data.logRecordsFollow));
      },
      error(err) {
        console.error('Subscription error:', err);
      },
      complete() {
        console.log('Subscription completed');
      },
    });

    return () => subscription.unsubscribe();
  }
}
