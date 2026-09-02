declare module "@cloudflare/workers-types" {
  export interface SqlStorageCursor<Row = Record<string, SqlStorageValue>> extends Iterable<Row> {
    readonly columnNames: ReadonlyArray<string>
    raw(): IterableIterator<ReadonlyArray<SqlStorageValue>>
  }

  export type SqlStorageValue = ArrayBuffer | string | number | null

  export interface SqlStorage {
    exec<Row = Record<string, SqlStorageValue>>(
      query: string,
      ...bindings: ReadonlyArray<SqlStorageValue>
    ): SqlStorageCursor<Row>
  }

  export interface DurableObjectTransaction {
    rollback(): void
  }

  export interface DurableObjectStorage {
    readonly sql: SqlStorage
    transaction<A>(callback: (transaction: DurableObjectTransaction) => Promise<A>): Promise<A>
    getAlarm(): Promise<number | null>
    setAlarm(scheduledTime: number | Date): Promise<void>
  }
}
