import { Schema } from "@effect/schema"
import { Effect } from "effect"

// Define schemas for our data models
export const User = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  email: Schema.String,
  role: Schema.String,
  department: Schema.String
})

export const Order = Schema.Struct({
  id: Schema.Number,
  customer_id: Schema.Number,
  description: Schema.String,
  amount: Schema.Number,
  status: Schema.String,
  created_at: Schema.Date
})

export const Product = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  category: Schema.String,
  price: Schema.Number,
  description: Schema.String
})

// Mock data
const mockUsers = [
  { id: 1, name: "John Doe", email: "john@company.com", role: "admin", department: "IT" },
  { id: 2, name: "Jane Smith", email: "jane@company.com", role: "user", department: "Sales" },
  { id: 3, name: "Bob Johnson", email: "bob@company.com", role: "manager", department: "Marketing" },
  { id: 4, name: "Alice Brown", email: "alice@company.com", role: "admin", department: "HR" },
  { id: 5, name: "Charlie Wilson", email: "charlie@company.com", role: "user", department: "Sales" }
]

const mockOrders = [
  { id: 1, customer_id: 2, description: "Enterprise Software License", amount: 50000, status: "completed", created_at: new Date('2024-01-15') },
  { id: 2, customer_id: 5, description: "Sales Training Package", amount: 15000, status: "pending", created_at: new Date('2024-01-20') },
  { id: 3, customer_id: 3, description: "Marketing Campaign Suite", amount: 25000, status: "completed", created_at: new Date('2024-01-10') },
  { id: 4, customer_id: 1, description: "IT Infrastructure Upgrade", amount: 75000, status: "processing", created_at: new Date('2024-01-25') },
  { id: 5, customer_id: 2, description: "Additional User Licenses", amount: 5000, status: "completed", created_at: new Date('2024-01-18') }
]

const mockProducts = [
  { id: 1, name: "Enterprise Suite", category: "software", price: 50000, description: "Comprehensive business management software" },
  { id: 2, name: "Sales Pro", category: "software", price: 15000, description: "Sales automation and CRM tool" },
  { id: 3, name: "Marketing Hub", category: "software", price: 25000, description: "Digital marketing platform" },
  { id: 4, name: "IT Manager", category: "software", price: 30000, description: "IT infrastructure management" },
  { id: 5, name: "Basic Plan", category: "subscription", price: 5000, description: "Entry-level business tools" }
]

// Database Service Interface
interface DatabaseService {
  getUsers: (filters?: { ids?: string[]; role?: string; department?: string }) => Effect.Effect<Array<typeof User.Type>, Error>
  getOrders: (filters?: { ids?: string[]; customer_id?: number; status?: string }) => Effect.Effect<Array<typeof Order.Type>, Error>
  getProducts: (filters?: { ids?: string[]; category?: string }) => Effect.Effect<Array<typeof Product.Type>, Error>
  getUserStats: (userId: number) => Effect.Effect<{ total_orders: number; total_spent: number }, Error>
}

// Mock Database Service Implementation
export class MockDatabaseService extends Effect.Service<MockDatabaseService>()("DatabaseService", {
  effect: Effect.succeed({
    getUsers: (filters?: { ids?: string[]; role?: string; department?: string }) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep("100 millis")

        let users = [...mockUsers]

        if (filters?.ids) {
          const numericIds = filters.ids.map((id) => parseInt(id))
          users = users.filter((user) => numericIds.includes(user.id))
        }

        if (filters?.role) {
          users = users.filter((user) => user.role === filters.role)
        }

        if (filters?.department) {
          users = users.filter((user) => user.department === filters.department)
        }

        return users
      }),

    getOrders: (filters?: { ids?: string[]; customer_id?: number; status?: string }) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep("150 millis")

        let orders = [...mockOrders]

        if (filters?.ids) {
          const numericIds = filters.ids.map((id) => parseInt(id))
          orders = orders.filter((order) => numericIds.includes(order.id))
        }

        if (filters?.customer_id) {
          orders = orders.filter((order) => order.customer_id === filters.customer_id)
        }

        if (filters?.status) {
          orders = orders.filter((order) => order.status === filters.status)
        }

        return orders
      }),

    getProducts: (filters?: { ids?: string[]; category?: string }) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep("120 millis")

        let products = [...mockProducts]

        if (filters?.ids) {
          const numericIds = filters.ids.map((id) => parseInt(id))
          products = products.filter((product) => numericIds.includes(product.id))
        }

        if (filters?.category) {
          products = products.filter((product) => product.category === filters.category)
        }

        return products
      }),

    getUserStats: (userId: number) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep("200 millis")

        const userOrders = mockOrders.filter((order) => order.customer_id === userId)
        const total_orders = userOrders.length
        const total_spent = userOrders.reduce((sum, order) => sum + order.amount, 0)

        return { total_orders, total_spent }
      })
  } as DatabaseService)
}) {}
