import { Schema } from "effect"

// Define enhanced schemas with validation rules
export const UserSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String.pipe(
    Schema.minLength(1, { message: () => "User name cannot be empty" }),
    Schema.maxLength(100, { message: () => "User name cannot exceed 100 characters" })
  ),
  email: Schema.String.pipe(
    Schema.pattern(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      { message: () => "Invalid email format" }
    )
  ),
  role: Schema.String.pipe(
    Schema.pattern(/^(admin|user|manager)$/, { message: () => "Invalid role value" })
  ),
  department: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Department name cannot be empty" }),
    Schema.maxLength(50, { message: () => "Department name cannot exceed 50 characters" })
  )
})

export const OrderSchema = Schema.Struct({
  id: Schema.Number,
  customer_id: Schema.Number,
  description: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Order description cannot be empty" }),
    Schema.maxLength(500, { message: () => "Order description cannot exceed 500 characters" })
  ),
  amount: Schema.Number.pipe(
    Schema.greaterThan(0, { message: () => "Order amount must be greater than zero" })
  ),
  status: Schema.String.pipe(
    Schema.pattern(/^(completed|pending|processing)$/, { message: () => "Invalid order status" })
  ),
  created_at: Schema.Date
})

export const ProductSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Product name cannot be empty" }),
    Schema.maxLength(100, { message: () => "Product name cannot exceed 100 characters" })
  ),
  category: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Product category cannot be empty" })
  ),
  price: Schema.Number.pipe(
    Schema.greaterThan(0, { message: () => "Product price must be greater than zero" })
  ),
  description: Schema.String.pipe(
    Schema.minLength(1, { message: () => "Product description cannot be empty" }),
    Schema.maxLength(500, { message: () => "Product description cannot exceed 500 characters" })
  )
})

// Define schemas for vector store operations
export const EmbeddingInputSchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  embedding: Schema.Array(Schema.Number).pipe(
    Schema.minItems(10, { message: () => "Embedding must have at least 10 dimensions" })
  ),
  type: Schema.Literal("order", "product", "user"),
  entity_id: Schema.String,
  metadata: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Any }),
    { exact: true }
  )
})

export const EmbeddingOutputSchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  type: Schema.Literal("order", "product", "user"),
  entity_id: Schema.String,
  metadata: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Any }),
    { exact: true }
  ),
  similarity: Schema.Number
})

// Define schemas for business intelligence
export const BusinessInsightSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  metrics: Schema.Array(Schema.Struct({
    label: Schema.String,
    value: Schema.Number,
    change: Schema.optional(Schema.Number),
    unit: Schema.optional(Schema.String)
  })),
  visualization: Schema.Literal("bar", "line", "pie", "table", "metric"),
  data: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  recommendations: Schema.Array(Schema.String),
  severity: Schema.Literal("high", "medium", "low", "info")
})

// Export type aliases
export type User = typeof UserSchema.Type
export type Order = typeof OrderSchema.Type
export type Product = typeof ProductSchema.Type
export type EmbeddingInput = typeof EmbeddingInputSchema.Type
export type EmbeddingOutput = typeof EmbeddingOutputSchema.Type
export type BusinessInsight = typeof BusinessInsightSchema.Type

// Export parse functions
export const parseUser = Schema.decodeUnknown(UserSchema)
export const parseOrder = Schema.decodeUnknown(OrderSchema)
export const parseProduct = Schema.decodeUnknown(ProductSchema)
export const parseEmbeddingInput = Schema.decodeUnknown(EmbeddingInputSchema)
export const parseEmbeddingOutput = Schema.decodeUnknown(EmbeddingOutputSchema)
export const parseBusinessInsight = Schema.decodeUnknown(BusinessInsightSchema)