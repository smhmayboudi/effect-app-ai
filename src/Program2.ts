import { OpenAiClient, OpenAiEmbeddingModel, OpenAiLanguageModel } from "@effect/ai-openai"
import { NodeHttpClient } from "@effect/platform-node"
import { SqlClient } from "@effect/sql"
import { NodeFS } from "@electric-sql/pglite/nodefs"
import { vector } from "@electric-sql/pglite/vector"
import { Config, Effect, Layer, pipe, String } from "effect"
import { BusinessIntelligenceService } from "./BusinessIntelligenceService.js"
import { AIServiceError, BusinessLogicError, DatabaseError, EmbeddingError, VectorStoreError } from "./Errors.js"
import { MockDatabaseService } from "./MockDatabaseService.js"
import { PGliteClient } from "./PGlite/index.js"
import { PGLiteQAService } from "./PGLiteQAService.js"
import { PGLiteVectorOps } from "./PGLiteVectorOps.js"

const biDemoProgram = Effect.gen(function*() {
  const biService = yield* BusinessIntelligenceService
  const qaService = yield* PGLiteQAService

  yield* Effect.logInfo("📈 Business Intelligence Demo Starting...")

  // Sync data first
  yield* qaService.syncDataToVectorStore().pipe(
    Effect.catchAll((error) => {
      if (error instanceof DatabaseError) {
        console.error("Database error during data sync:", error.message)
        return Effect.die(error)
      } else if (error instanceof EmbeddingError) {
        console.error("Embedding error during data sync:", error.message)
        return Effect.die(error)
      } else if (error instanceof VectorStoreError) {
        console.error("Vector store error during data sync:", error.message)
        return Effect.die(error)
      }
      console.error("Unexpected error during data sync:", error)
      return Effect.die(error)
    })
  )

  // 1. Get comprehensive dashboard
  yield* Effect.logInfo("📊 Generating KPI Dashboard...")
  const dashboard = yield* biService.getKPIDashboard().pipe(
    Effect.catchAll((error) => {
      if (error instanceof DatabaseError) {
        console.error("Database error getting KPI dashboard:", error.message)
        return Effect.succeed({
          overview: {
            totalRevenue: 0,
            totalUsers: 0,
            totalOrders: 0,
            completedOrders: 0,
            averageOrderValue: 0,
            conversionRate: 0
          },
          anomalies: [],
          trends: "Error occurred while generating trends"
        })
      } else if (error instanceof BusinessLogicError) {
        console.error("Business logic error getting KPI dashboard:", error.message)
        return Effect.succeed({
          overview: {
            totalRevenue: 0,
            totalUsers: 0,
            totalOrders: 0,
            completedOrders: 0,
            averageOrderValue: 0,
            conversionRate: 0
          },
          anomalies: [],
          trends: "Error occurred while generating trends"
        })
      }
      console.error("Unexpected error getting KPI dashboard:", error)
      return Effect.succeed({
        overview: {
          totalRevenue: 0,
          totalUsers: 0,
          totalOrders: 0,
          completedOrders: 0,
          averageOrderValue: 0,
          conversionRate: 0
        },
        anomalies: [],
        trends: "Error occurred while generating trends"
      })
    })
  )
  yield* Effect.logInfo("Dashboard Overview:", dashboard.overview)

  // 2. Natural language queries to insights
  const nlQueries = [
    "Show me revenue by customer segment",
    "What are our sales trends this month?",
    "Which products are most profitable?",
    "How are our user demographics distributed?"
  ]

  for (const query of nlQueries) {
    yield* Effect.logInfo(`\n🗣️  NL Query: "${query}"`)
    const result = yield* biService.naturalLanguageToDashboard(query).pipe(
      Effect.catchAll((error) => {
        if (error instanceof AIServiceError) {
          console.error(`AI service error for query "${query}":`, error.message)
          return Effect.succeed({
            query,
            visualizationType: "table",
            data: [],
            insights: "Error occurred while processing query",
            suggestedActions: ["Retry the query or check the data source"]
          })
        } else if (error instanceof BusinessLogicError) {
          console.error(`Business logic error for query "${query}":`, error.message)
          return Effect.succeed({
            query,
            visualizationType: "table",
            data: [],
            insights: "Error occurred while processing query",
            suggestedActions: ["Retry the query or check the data source"]
          })
        } else if (error instanceof DatabaseError) {
          console.error(`Database error for query "${query}":`, error.message)
          return Effect.succeed({
            query,
            visualizationType: "table",
            data: [],
            insights: "Error occurred while processing query",
            suggestedActions: ["Retry the query or check the data source"]
          })
        }
        console.error(`Unexpected error for query "${query}":`, error)
        return Effect.succeed({
          query,
          visualizationType: "table",
          data: [],
          insights: "Error occurred while processing query",
          suggestedActions: ["Retry the query or check the data source"]
        })
      })
    )
    yield* Effect.logInfo(`📈 Visualization Type: ${result.visualizationType}`)
    yield* Effect.logInfo(`💡 Insights: ${result.insights}`)
  }

  // 3. Customer segmentation
  yield* Effect.logInfo("\n👥 Analyzing Customer Segments...")
  const segments = yield* biService.segmentCustomers().pipe(
    Effect.catchAll((error) => {
      if (error instanceof AIServiceError) {
        console.error("AI seervice error during customer segmentation:", error.message)
        return Effect.succeed({ segments: {}, statistics: {}, recommendations: [] })
      } else if (error instanceof DatabaseError) {
        console.error("Database error during customer segmentation:", error.message)
        return Effect.succeed({ segments: {}, statistics: {}, recommendations: [] })
      }
      console.error("Unexpected error during customer segmentation:", error)
      return Effect.succeed({ segments: {}, statistics: {}, recommendations: [] })
    })
  )
  yield* Effect.logInfo("Customer Segments:", Object.keys(segments.segments))

  // 4. Automated insights
  yield* Effect.logInfo("\n🔍 Generating Automated Business Insights...")
  const insights = yield* biService.generateBusinessInsights().pipe(
    Effect.catchAll((error) => {
      if (error instanceof BusinessLogicError) {
        console.error("Business logic error generating business insights:", error.message)
        return Effect.succeed([])
      }
      console.error("Unexpected error generating business insights:", error)
      return Effect.succeed([])
    })
  )
  yield* Effect.forEach(insights, (insight) =>
    Effect.logInfo(`\n⚠️\t${insight.title} (${insight.severity})`).pipe(
      Effect.andThen(Effect.logInfo(`\t${insight.description}`)),
      Effect.andThen(
        Effect.forEach(insight.recommendations, (rec) => Effect.logInfo(`\t💡 ${rec}`))
      )
    ))

  return "🎯 Business Intelligence demo completed!"
})

// Create the base OpenAI client layer
const OpenAi = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY")
})

const OpenAiWithHttp = Layer.provide(OpenAi, NodeHttpClient.layerUndici)

// Create the complete AI layers by providing the OpenAI client
const EmbeddingModelLayer = Layer.provide(
  OpenAiEmbeddingModel.model("text-embedding-3-small", { mode: "batched" }),
  OpenAiWithHttp
)
const LanguageModelLayer = Layer.provide(
  OpenAiLanguageModel.model("gpt-5-nano"),
  OpenAiWithHttp
)

// Create the AI layers
const AiLayers = Layer.mergeAll(
  EmbeddingModelLayer,
  LanguageModelLayer
)

// const Migrator = PGliteMigrator.layer({
//   loader: PGliteMigrator.fromFileSystem(
//     fileURLToPath(new URL("./migration/", import.meta.url))
//   ),
//   table: "tbl_sql_migration"
// }).pipe(
//   Layer.provide(NodeContext.layer)
// )

export const Migrator = Layer.effectDiscard(
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE EXTENSION IF NOT EXISTS vector`
    yield* sql`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding VECTOR(1536) NOT NULL,
        type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    yield* sql`
      CREATE INDEX IF NOT EXISTS embeddings_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `
  })
)

const Client = PGliteClient.layer({
  extensions: { vector },
  fs: new NodeFS("./data/"),
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})

const Sql = Migrator.pipe(Layer.provideMerge(Client))

// Create the core application layers
const CoreLayers = Layer.mergeAll(
  MockDatabaseService.Default,
  PGLiteVectorOps.Default.pipe(Layer.provide(Sql))
)

// Create the complete application layer by merging all dependencies
const AppLayer = Layer.provide(
  PGLiteQAService.Default,
  CoreLayers
).pipe(
  Layer.provide(AiLayers)
)

// Add to your layer configuration
const BILayer = BusinessIntelligenceService.Default.pipe(
  Layer.provide(MockDatabaseService.Default)
).pipe(
  Layer.provideMerge(AppLayer)
)

// Run the BI demo
pipe(
  biDemoProgram,
  Effect.provide(BILayer),
  Effect.tapBoth({
    onFailure: (error) => Effect.sync(() => Effect.logError(`💥 BI Error: ${error}`)),
    onSuccess: (result) => Effect.sync(() => Effect.logInfo(result))
  }),
  Effect.runPromise
)
