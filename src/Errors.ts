import { Data } from "effect"

// Define custom error types for our application
export class AIServiceError extends Data.TaggedClass("AIServiceError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class BusinessLogicError extends Data.TaggedClass("BusinessLogicError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class EmbeddingError extends Data.TaggedClass("EmbeddingError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class VectorStoreError extends Data.TaggedClass("VectorStoreError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
