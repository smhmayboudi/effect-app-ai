/**
 * @since 1.0.0
 * @category models
 */

import { Duration, Effect } from "effect"
import { DatabaseError } from "./Errors.js"
import type { Order, Product, User } from "./Schemas.js"

/**
 * @description Mock users data for testing and development
 */
const mockUsers: Array<User> = [
  { id: 1, name: "John Doe", email: "john@company.com", role: "admin", department: "IT" },
  { id: 2, name: "Jane Smith", email: "jane@company.com", role: "user", department: "Sales" },
  { id: 3, name: "Bob Johnson", email: "bob@company.com", role: "manager", department: "Marketing" },
  { id: 4, name: "Alice Brown", email: "alice@company.com", role: "admin", department: "HR" },
  { id: 5, name: "Charlie Wilson", email: "charlie@company.com", role: "user", department: "Sales" }
]

/**
 * @description Mock orders data for testing and development
 */
const mockOrders: Array<Order> = [
  {
    id: 1,
    customer_id: 2,
    description: "Enterprise Software License",
    amount: 50000,
    status: "completed",
    created_at: new Date("2024-01-15")
  },
  {
    id: 2,
    customer_id: 5,
    description: "Sales Training Package",
    amount: 15000,
    status: "pending",
    created_at: new Date("2024-01-20")
  },
  {
    id: 3,
    customer_id: 3,
    description: "Marketing Campaign Suite",
    amount: 25000,
    status: "completed",
    created_at: new Date("2024-01-10")
  },
  {
    id: 4,
    customer_id: 1,
    description: "IT Infrastructure Upgrade",
    amount: 75000,
    status: "processing",
    created_at: new Date("2024-01-25")
  },
  {
    id: 5,
    customer_id: 2,
    description: "Additional User Licenses",
    amount: 5000,
    status: "completed",
    created_at: new Date("2024-01-18")
  }
]

/**
 * @description Mock products data for testing and development
 */
const mockProducts: Array<Product> = [
  {
    id: 1,
    name: "Enterprise Suite",
    category: "software",
    price: 50000,
    description: "Comprehensive business management software"
  },
  { id: 2, name: "Sales Pro", category: "software", price: 15000, description: "Sales automation and CRM tool" },
  { id: 3, name: "Marketing Hub", category: "software", price: 25000, description: "Digital marketing platform" },
  { id: 4, name: "IT Manager", category: "software", price: 30000, description: "IT infrastructure management" },
  { id: 5, name: "Basic Plan", category: "subscription", price: 5000, description: "Entry-level business tools" }
]

/**
 * @since 1.0.0
 * @category models
 * @description Mock Database Service Implementation for testing and development
 */
export class MockDatabaseService extends Effect.Service<MockDatabaseService>()("DatabaseService", {
  effect: Effect.succeed({
    /**
     * @description Gets users from the mock database with optional filters
     * @param filters Optional filters to apply to the user query (by id, role, or department)
     * @returns Array of users matching the filters
     */
    getUsers: (filters?: { ids?: Array<string>; role?: string; department?: string }) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep(Duration.millis(1))

        try {
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
        } catch (error) {
          throw new DatabaseError({
            message: "Failed to get users from database",
            cause: error
          })
        }
      }),

    /**
     * @description Gets orders from the mock database with optional filters
     * @param filters Optional filters to apply to the order query (by id, customer_id, or status)
     * @returns Array of orders matching the filters
     */
    getOrders: (filters?: { ids?: Array<string>; customer_id?: number; status?: string }) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep(Duration.millis(1))

        try {
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
        } catch (error) {
          throw new DatabaseError({
            message: "Failed to get orders from database",
            cause: error
          })
        }
      }),

    /**
     * @description Gets products from the mock database with optional filters
     * @param filters Optional filters to apply to the product query (by id or category)
     * @returns Array of products matching the filters
     */
    getProducts: (filters?: { ids?: Array<string>; category?: string }) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep(Duration.millis(1))

        try {
          let products = [...mockProducts]

          if (filters?.ids) {
            const numericIds = filters.ids.map((id) => parseInt(id))
            products = products.filter((product) => numericIds.includes(product.id))
          }

          if (filters?.category) {
            products = products.filter((product) => product.category === filters.category)
          }

          return products
        } catch (error) {
          throw new DatabaseError({
            message: "Failed to get products from database",
            cause: error
          })
        }
      }),

    /**
     * @description Gets user statistics from the mock database
     * @param userId The ID of the user to get statistics for
     * @returns User statistics including total orders and total amount spent
     */
    getUserStats: (userId: number) =>
      Effect.gen(function*() {
        // Simulate async database call
        yield* Effect.sleep(Duration.millis(1))

        try {
          const userOrders = mockOrders.filter((order) => order.customer_id === userId)
          const total_orders = userOrders.length
          const total_spent = userOrders.reduce((sum, order) => sum + order.amount, 0)

          return { total_orders, total_spent }
        } catch (error) {
          throw new DatabaseError({
            message: `Failed to get user stats for user ID: ${userId}`,
            cause: error
          })
        }
      })
  })
}) {}
