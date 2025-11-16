/**
 * @since 1.0.0
 */
import * as Reactivity from "@effect/experimental/Reactivity"
import * as Client from "@effect/sql/SqlClient"
import type { Connection } from "@effect/sql/SqlConnection"
import { SqlError } from "@effect/sql/SqlError"
import * as Statement from "@effect/sql/Statement"
import * as Pglite from "@electric-sql/pglite"
import * as Config from "effect/Config"
import type { ConfigError } from "effect/ConfigError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
// import type * as Redacted from "effect/Redacted"
import type * as Scope from "effect/Scope"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

export type PGlite<O extends Pglite.PGliteOptions> = Pglite.PGlite & Pglite.PGliteInterfaceExtensions<O["extensions"]>

/**
 * @category type ids
 * @since 1.0.0
 */
export const TypeId: unique symbol = Symbol.for("@effect/sql-pglite/PgliteClient")

/**
 * @category type ids
 * @since 1.0.0
 */
export type TypeId = typeof TypeId

/**
 * @category models
 * @since 1.0.0
 */
export interface PgliteClient<O extends Pglite.PGliteOptions = Pglite.PGliteOptions> extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: PgliteClientConfig<O>
}

/**
 * @category tags
 * @since 1.0.0
 */
export const PgliteClient = Context.GenericTag<PgliteClient>("@effect/sql-pglite/PgliteClient")

const PgliteTransaction = Context.GenericTag<readonly [PgliteConnection, counter: number]>(
  "@effect/sql-pglite/PgliteClient/PgliteTransaction"
)

/**
 * @category models
 * @since 1.0.0
 */
export interface PgliteClientConfig<O extends Pglite.PGliteOptions> {
  readonly spanAttributes?: Record<string, unknown> | undefined
  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined

  // /** The database URL.
  //  *
  //  * The client supports `pglite:`, `http:`/`https:`, `ws:`/`wss:` and `file:` URL. For more infomation,
  //  * please refer to the project README:
  //  *
  //  * https://github.com/pglite/pglite-client-ts#supported-urls
  //  */
  // readonly url: string | URL
  // /** Authentication token for the database. */
  // readonly authToken?: Redacted.Redacted | undefined
  // /** Encryption key for the database. */
  // readonly encryptionKey?: Redacted.Redacted | undefined
  // /** URL of a remote server to synchronize database with. */
  // readonly syncUrl?: string | URL | undefined
  // /** Sync interval in seconds. */
  // readonly syncInterval?: number | undefined
  // /** Enables or disables TLS for `pglite:` URLs.
  //  *
  //  * By default, `pglite:` URLs use TLS. You can set this option to `false` to disable TLS.
  //  */
  // readonly tls?: boolean | undefined
  // /** How to convert SQLite integers to JavaScript values:
  //  *
  //  * - `"number"` (default): returns SQLite integers as JavaScript `number`-s (double precision floats).
  //  * `number` cannot precisely represent integers larger than 2^53-1 in absolute value, so attempting to read
  //  * larger integers will throw a `RangeError`.
  //  * - `"bigint"`: returns SQLite integers as JavaScript `bigint`-s (arbitrary precision integers). Bigints can
  //  * precisely represent all SQLite integers.
  //  * - `"string"`: returns SQLite integers as strings.
  //  */
  // readonly intMode?: "number" | "bigint" | "string" | undefined
  // /** Concurrency limit.
  //  *
  //  * By default, the client performs up to 20 concurrent requests. You can set this option to a higher
  //  * number to increase the concurrency limit or set it to 0 to disable concurrency limits completely.
  //  */
  // readonly concurrency?: number | undefined
  dataDir?: string
  username?: string
  database?: string
  // fs?: Filesystem
  // debug?: DebugLevel
  relaxedDurability?: boolean
  // extensions?: TExtensions
  loadDataDir?: Blob | File
  initialMemory?: number
  wasmModule?: WebAssembly.Module
  fsBundle?: Blob | File
  // parsers?: ParserOptions
  // serializers?: SerializerOptions

  readonly liveClient: PGlite<O>
}

type PgliteConnection = Connection
// interface PgliteConnection extends Connection {
//   readonly beginTransaction: Effect.Effect<PgliteConnection, SqlError>
//   readonly commit: Effect.Effect<void, SqlError>
//   readonly rollback: Effect.Effect<void, SqlError>
// }

/**
 * @category constructor
 * @since 1.0.0
 */
export const make = <O extends Pglite.PGliteOptions>(
  options: PgliteClientConfig<O>
): Effect.Effect<PgliteClient, never, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(
        options.transformResultNames
      ).array :
      undefined

    const spanAttributes: Array<[string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "sqlite"]
    ]

    class PgliteConnectionImpl implements PgliteConnection {
      constructor(readonly sdk: PGlite<O> | Pglite.Transaction) {}

      run(
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) {
        return Effect.map(
          Effect.tryPromise({
            try: () => this.sdk.query(sql, params as Array<any>),
            catch: (cause) => new SqlError({ cause, message: "Failed to execute statement" })
          }),
          (results) => results.rows
        )
      }

      runRaw(
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) {
        return Effect.tryPromise({
          try: () => this.sdk.query(sql, params as Array<any>),
          catch: (cause) => new SqlError({ cause, message: "Failed to execute statement" })
        })
      }

      execute(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ): Effect.Effect<ReadonlyArray<any>, SqlError> {
        return transformRows
          ? Effect.map(this.run(sql, params), transformRows as any)
          : this.run(sql, params)
      }

      executeRaw(sql: string, params: ReadonlyArray<unknown>) {
        return this.runRaw(sql, params)
      }

      executeValues(sql: string, params: ReadonlyArray<unknown>) {
        return Effect.map(this.run(sql, params), (rows) => rows.map((row) => Array.from(row as any) as Array<any>))
      }

      executeUnprepared(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ) {
        return this.execute(sql, params, transformRows)
      }

      executeStream() {
        return Effect.dieMessage("executeStream not implemented")
      }

      // get beginTransaction<T>(callback: (tx: Pglite.Transaction) => Promise<T>) {
      //   return Effect.map(
      //     Effect.tryPromise({
      //       try: () => (this.sdk as PGlite<O>).transaction(callback),
      //       catch: (cause) => new SqlError({ cause, message: "Failed to begin transaction" })
      //     }),
      //     (tx) => new PgliteConnectionImpl(tx)
      //   )
      // }

      // get commit() {
      //   return Effect.tryPromise({
      //     try: () => (this.sdk as Pglite.Transaction).commit(),
      //     catch: (cause) => new SqlError({ cause, message: "Failed to commit transaction" })
      //   })
      // }

      // get rollback() {
      //   return Effect.tryPromise({
      //     try: () => (this.sdk as Pglite.Transaction).rollback(),
      //     catch: (cause) => new SqlError({ cause, message: "Failed to rollback transaction" })
      //   })
      // }
    }

    const connection = "liveClient" in options
      ? new PgliteConnectionImpl(options.liveClient)
      : yield* Effect.map(
        Effect.acquireRelease(
          Effect.promise(() => Pglite.PGlite.create(options as O) // {
            //   ...options,
            //   authToken: Redacted.isRedacted(options.authToken)
            //     ? Redacted.value(options.authToken)
            //     : options.authToken,
            //   encryptionKey: Redacted.isRedacted(options.encryptionKey)
            //     ? Redacted.value(options.encryptionKey)
            //     : options.encryptionKey,
            //   url: options.url.toString(),
            //   syncUrl: options.syncUrl?.toString()
            // } as Pglite.Config
          ),
          (sdk) => Effect.sync(() => sdk.close())
        ),
        (sdk) => new PgliteConnectionImpl(sdk)
      )
    const semaphore = yield* Effect.makeSemaphore(1)

    // const withTransaction = Client.makeWithTransaction({
    //   transactionTag: PgliteTransaction,
    //   spanAttributes,
    //   acquireConnection: Effect.uninterruptibleMask((restore) =>
    //     Scope.make().pipe(
    //       Effect.bindTo("scope"),
    //       Effect.bind("conn", ({ scope }) =>
    //         restore(semaphore.take(1)).pipe(
    //           Effect.zipRight(Scope.addFinalizer(scope, semaphore.release(1))),
    //           Effect.zipRight(connection.beginTransaction)
    //         )),
    //       Effect.map(({ conn, scope }) => [scope, conn] as const)
    //     )
    //   ),
    //   begin: () => Effect.void, // already begun in acquireConnection
    //   savepoint: (conn, id) => conn.executeRaw(`SAVEPOINT effect_sql_${id};`, []),
    //   commit: () => Effect.void,
    //   rollback: (conn) => conn.rollback,
    //   rollbackSavepoint: (conn, id) => conn.executeRaw(`ROLLBACK TO SAVEPOINT effect_sql_${id};`, [])
    // })

    const acquirer = Effect.flatMap(
      Effect.serviceOption(PgliteTransaction),
      Option.match({
        onNone: () => semaphore.withPermits(1)(Effect.succeed(connection as PgliteConnection)),
        onSome: ([conn]) => Effect.succeed(conn)
      })
    )

    return Object.assign(
      yield* Client.make({
        acquirer,
        compiler,
        spanAttributes,
        transformRows
      }),
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        // withTransaction,
        sdk: connection.sdk
      }
    )
  })

/**
 * @category layers
 * @since 1.0.0
 */
export const layerConfig = <O extends Pglite.PGliteOptions>(
  config: Config.Config.Wrap<PgliteClientConfig<O>>
): Layer.Layer<PgliteClient | Client.SqlClient, ConfigError> =>
  Layer.scopedContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(PgliteClient, client).pipe(
          Context.add(Client.SqlClient, client)
        )
      )
    )
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * @category layers
 * @since 1.0.0
 */
export const layer = <O extends Pglite.PGliteOptions>(
  config: PgliteClientConfig<O>
): Layer.Layer<PgliteClient | Client.SqlClient> =>
  Layer.scopedContext(
    Effect.map(make(config), (client) =>
      Context.make(PgliteClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))
