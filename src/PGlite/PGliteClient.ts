/**
 * @since 1.0.0
 */
import * as Reactivity from "@effect/experimental/Reactivity"
import * as SqlClient from "@effect/sql/SqlClient"
import type * as SqlConnection from "@effect/sql/SqlConnection"
import * as SqlError from "@effect/sql/SqlError"
import * as Statement from "@effect/sql/Statement"
import * as Pglite from "@electric-sql/pglite"
import type * as basefs from "@electric-sql/pglite/basefs"
import * as Config from "effect/Config"
import type * as ConfigError from "effect/ConfigError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Scope from "effect/Scope"

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
export interface PgliteClient<O extends Pglite.PGliteOptions = Pglite.PGliteOptions> extends SqlClient.SqlClient {
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

  dataDir?: string
  username?: string
  database?: string
  fs?: basefs.Filesystem
  debug?: Pglite.DebugLevel
  relaxedDurability?: boolean
  extensions?: Pglite.Extensions
  loadDataDir?: Blob | File
  initialMemory?: number
  wasmModule?: WebAssembly.Module
  fsBundle?: Blob | File
  parsers?: Pglite.ParserOptions
  serializers?: Pglite.SerializerOptions

  readonly liveClient?: PGlite<O>
}

type PgliteConnection = SqlConnection.Connection

/**
 * @category constructor
 * @since 1.0.0
 */
export const make = <O extends Pglite.PGliteOptions>(
  options: PgliteClientConfig<O>
): Effect.Effect<PgliteClient, never, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const compiler = Statement.makeCompiler({
      dialect: "pg",
      onCustom: () => {
        throw new Error("onCustom not implemented for PGlite")
      },
      onIdentifier: (value) => "\"" + value.replace(new RegExp("\"", "g"), "\"" + "\"") + "\"",
      onInsert: () => {
        throw new Error("onInsert not implemented for PGlite")
      },
      onRecordUpdate: () => {
        throw new Error("onRecordUpdate not implemented for PGlite")
      },
      onRecordUpdateSingle: () => {
        throw new Error("onRecordUpdateSingle not implemented for PGlite")
      },
      placeholder: (index, _value) => `$${index}`
    })
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(
        options.transformResultNames
      ).array :
      undefined

    const spanAttributes: Array<[string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "postgresql"]
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
            catch: (cause) => new SqlError.SqlError({ cause, message: "Failed to execute statement" })
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
          catch: (cause) => new SqlError.SqlError({ cause, message: "Failed to execute statement" })
        })
      }

      execute(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ): Effect.Effect<ReadonlyArray<any>, SqlError.SqlError> {
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
    }

    const connection = "liveClient" in options
      ? new PgliteConnectionImpl(options.liveClient)
      : yield* Effect.map(
        Effect.acquireRelease(
          Effect.promise(() => Pglite.PGlite.create(options as O)),
          (sdk) => Effect.sync(() => sdk.close())
        ),
        (sdk) => new PgliteConnectionImpl(sdk)
      )

    // Create transaction support by properly integrating with PGlite's transaction functionality
    const withTransaction = SqlClient.makeWithTransaction({
      transactionTag: PgliteTransaction,
      spanAttributes,
      acquireConnection: Effect.uninterruptibleMask((restore) =>
        Scope.make().pipe(
          Effect.flatMap((scope) =>
            restore(Effect.succeed(connection as PgliteConnection)).pipe(
              Effect.flatMap((conn) =>
                conn.executeUnprepared("BEGIN", [], undefined).pipe(
                  Effect.as([scope, conn] as const),
                  Effect.ensuring(
                    // Add finalizer to ensure the transaction is properly closed if not committed
                    Effect.orDie(conn.executeUnprepared("ROLLBACK", [], undefined)).pipe(
                      Effect.ignore
                    )
                  )
                )
              )
            )
          )
        )
      ),
      begin: (_conn) => Effect.void, // Already started in acquireConnection
      savepoint: (conn, id) => conn.executeUnprepared(`SAVEPOINT effect_sql_${id};`, [], undefined),
      commit: (conn) => conn.executeUnprepared("COMMIT", [], undefined),
      rollback: (conn) => conn.executeUnprepared("ROLLBACK", [], undefined),
      rollbackSavepoint: (conn, id) => conn.executeUnprepared(`ROLLBACK TO SAVEPOINT effect_sql_${id};`, [], undefined)
    })

    const acquirer = Effect.flatMap(
      Effect.serviceOption(PgliteTransaction),
      Option.match({
        onNone: () => Effect.succeed(connection as PgliteConnection),
        onSome: ([conn]) => Effect.succeed(conn)
      })
    )

    return Object.assign(
      yield* SqlClient.make({
        acquirer,
        beginTransaction: "BEGIN",
        commit: "COMMIT",
        compiler,
        rollback: "ROLLBACK",
        rollbackSavepoint: (id: string) => `ROLLBACK TO SAVEPOINT ${id}`,
        savepoint: (id: string) => `SAVEPOINT ${id}`,
        spanAttributes,
        transactionAcquirer: Effect.succeed(connection as PgliteConnection), // Provide a direct acquirer for transactions
        transformRows
      }),
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        withTransaction,
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
): Layer.Layer<PgliteClient | SqlClient.SqlClient, ConfigError.ConfigError> =>
  Layer.scopedContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(PgliteClient, client).pipe(
          Context.add(SqlClient.SqlClient, client)
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
): Layer.Layer<PgliteClient | SqlClient.SqlClient> =>
  Layer.scopedContext(
    Effect.map(make(config), (client) =>
      Context.make(PgliteClient, client).pipe(
        Context.add(SqlClient.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))
