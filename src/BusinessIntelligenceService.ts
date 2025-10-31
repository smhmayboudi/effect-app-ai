import { Effect, Schema } from "effect"
import { MockDatabaseService, type Order, type User } from "./MockDatabaseService.js"
import { PGLiteQAService } from "./PGLiteQAService.js"

export const BusinessInsight = Schema.Struct({
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
export type BusinessInsight = typeof BusinessInsight.Type

export class BusinessIntelligenceService
  extends Effect.Service<BusinessIntelligenceService>()("BusinessIntelligenceService", {
    effect: Effect.gen(function*() {
      const db = yield* MockDatabaseService
      const qaService = yield* PGLiteQAService

      // 1. Automated KPI Monitoring
      const getKPIDashboard = () =>
        Effect.gen(function*() {
          const [users, orders] = yield* Effect.all([
            db.getUsers(),
            db.getOrders()
          ], { concurrency: 2 })

          // Calculate key metrics
          const completedOrders = orders.filter((order) => order.status === "completed")
          const totalRevenue = completedOrders.reduce((sum, order) => sum + order.amount, 0)
          const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0
          const conversionRate = completedOrders.length / orders.length * 100

          // Detect anomalies
          const recentLargeOrders = orders.filter((order) =>
            order.amount > 50000 &&
            order.created_at > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          )

          return {
            overview: {
              totalRevenue,
              totalUsers: users.length,
              totalOrders: orders.length,
              completedOrders: completedOrders.length,
              averageOrderValue: Math.round(averageOrderValue),
              conversionRate: Math.round(conversionRate * 100) / 100
            },
            anomalies: recentLargeOrders,
            trends: yield* analyzeBusinessTrends(orders, users)
          }
        })

      // 2. Natural Language Query to Dashboard
      const naturalLanguageToDashboard = (query: string) =>
        Effect.gen(function*() {
          const analysis = yield* qaService.getQuestionAnalysis(query)
          const visualizationType = yield* determineVisualizationType(query)
          const data = yield* executeAnalyticalQuery(analysis)
          const insights = yield* generateDataInsights(data, query)

          return {
            query,
            visualization: visualizationType,
            data: data.slice(0, 10), // Limit data size for response
            insights,
            suggestedActions: yield* generateRecommendedActions(insights)
          }
        })

      // 3. Predictive Analytics
      const predictSalesTrends = (period: "weekly" | "monthly" | "quarterly" = "monthly") =>
        Effect.gen(function*() {
          const orders = yield* db.getOrders()
          const historicalData = orders
            .filter((order) => order.status === "completed")
            .map((order) => ({
              date: order.created_at,
              amount: order.amount
            }))

          const trend = calculateTrend(historicalData, period)

          return {
            period,
            currentTrend: trend.direction,
            confidence: Math.round(trend.confidence * 100) / 100,
            forecast: Math.round(trend.forecast),
            factors: yield* identifyTrendFactors(trend, orders),
            recommendation: getTrendRecommendation(trend.direction, period)
          }
        })

      // 4. Customer Segmentation
      const segmentCustomers = () =>
        Effect.gen(function*() {
          const [users, orders] = yield* Effect.all([
            db.getUsers(),
            db.getOrders()
          ], { concurrency: 2 })

          const customerSegments = users.map((user) => {
            const userOrders = orders.filter((order) => order.customer_id === user.id)
            const totalSpent = userOrders.reduce((sum, order) => sum + order.amount, 0)
            const lastOrder = userOrders.length > 0
              ? Math.max(...userOrders.map((o) => o.created_at.getTime()))
              : 0

            const recency = Date.now() - lastOrder
            const frequency = userOrders.length
            const monetary = totalSpent

            return {
              user,
              segment: calculateRFMSegment(recency, frequency, monetary),
              metrics: {
                recency: Math.round(recency / (24 * 60 * 60 * 1000)), // Convert to days
                frequency,
                monetary,
                totalOrders: userOrders.length
              }
            }
          })

          const groupedSegments = groupBySegment(customerSegments)
          const segmentStats = calculateSegmentStats(groupedSegments)

          return {
            segments: groupedSegments,
            statistics: segmentStats,
            recommendations: yield* generateSegmentRecommendations(segmentStats)
          }
        })

      const generateBusinessInsights = () =>
        Effect.gen(function*() {
          const [dashboard, segments, trends] = yield* Effect.all([
            getKPIDashboard(),
            segmentCustomers(),
            predictSalesTrends()
          ], { concurrency: 3 })

          const insights: Array<BusinessInsight> = []

          // Revenue insights - using dashboard data
          if (dashboard.overview.totalRevenue > 100000) {
            insights.push({
              id: "high-revenue",
              title: "Strong Revenue Performance",
              description: `Company has exceeded $${
                Math.round(dashboard.overview.totalRevenue / 1000)
              }K in total revenue`,
              metrics: [
                { label: "Total Revenue", value: dashboard.overview.totalRevenue, unit: "$" },
                { label: "Average Order Value", value: dashboard.overview.averageOrderValue, unit: "$" },
                { label: "Conversion Rate", value: dashboard.overview.conversionRate, unit: "%" }
              ],
              visualization: "metric",
              data: [],
              recommendations: [
                "Consider expanding high-value product lines",
                "Evaluate customer acquisition costs for optimization"
              ],
              severity: "info"
            })
          }

          // Anomaly insights - using dashboard anomalies
          if (dashboard.anomalies.length > 0) {
            insights.push({
              id: "large-orders",
              title: "Recent Large Orders Detected",
              description: `${dashboard.anomalies.length} high-value orders in the past week`,
              metrics: [
                { label: "Large Orders", value: dashboard.anomalies.length },
                { label: "Total Value", value: dashboard.anomalies.reduce((sum, o) => sum + o.amount, 0), unit: "$" }
              ],
              visualization: "bar",
              data: dashboard.anomalies.map((order) => ({
                id: order.id,
                amount: order.amount,
                customer: order.customer_id,
                description: order.description
              })),
              recommendations: [
                "Follow up with customers for repeat business",
                "Analyze what drove these large purchases"
              ],
              severity: "medium"
            })
          }

          // Customer segment insights - using segments data
          const championCount = segments.segments.champions?.length || 0
          if (championCount > 0) {
            insights.push({
              id: "champion-customers",
              title: "High-Value Customer Segment Identified",
              description: `${championCount} champion customers driving significant revenue`,
              metrics: [
                { label: "Champion Customers", value: championCount },
                { label: "Segment Revenue", value: segments.statistics.champions?.totalRevenue || 0, unit: "$" }
              ],
              visualization: "pie",
              data: Object.entries(segments.statistics).map(([segment, stats]) => ({
                segment,
                customerCount: stats.customerCount,
                totalRevenue: stats.totalRevenue
              })),
              recommendations: [
                "Create exclusive offers for champion customers",
                "Develop loyalty program for high-value segments"
              ],
              severity: "high"
            })
          }

          // Trend insights - using trends data
          if (trends.currentTrend === "up") {
            insights.push({
              id: "positive-trend",
              title: "Positive Sales Trend Detected",
              description: `Sales showing ${trends.currentTrend}ward trend with ${
                (trends.confidence * 100).toFixed(1)
              }% confidence`,
              metrics: [
                { label: "Trend Direction", value: trends.currentTrend === "up" ? 1 : -1 },
                { label: "Confidence", value: trends.confidence * 100, unit: "%" },
                { label: "Next Period Forecast", value: trends.forecast, unit: "$" }
              ],
              visualization: "line",
              data: [],
              recommendations: [trends.recommendation],
              severity: "info"
            })
          }

          return insights
        })

      // Helper functions
      const determineVisualizationType = (query: string) =>
        Effect.gen(function*() {
          const response = yield* qaService.answerQuestion(
            `What type of chart best visualizes this business question? Choose from: bar, line, pie, table, metric. Return only the chart type. Question: ${query}`
          )

          const chartType = response.toLowerCase().trim()
          if (["bar", "line", "pie", "table", "metric"].includes(chartType)) {
            return chartType as "bar" | "line" | "pie" | "table" | "metric"
          }
          return "table"
        })

      const executeAnalyticalQuery = (analysis: any) =>
        Effect.gen(function*() {
          if (analysis.entities?.includes("order")) {
            return yield* db.getOrders()
          }
          if (analysis.entities?.includes("user")) {
            return yield* db.getUsers()
          }
          if (analysis.entities?.includes("product")) {
            return yield* db.getProducts()
          }
          // Default: return all orders for business analysis
          return yield* db.getOrders()
        })

      const generateDataInsights = (data: any, originalQuery: string) =>
        qaService.answerQuestion(
          `Analyze this business data and provide 3 key insights. Data sample: ${
            JSON.stringify(data.slice(0, 5))
          }. Original question: ${originalQuery}. Keep insights concise.`
        )

      const generateRecommendedActions = (insights: string) =>
        qaService.answerQuestion(
          `Based on these insights: ${insights}, suggest 2-3 actionable business recommendations. Return as a simple list.`
        )

      const calculateTrend = (
        data: Array<{ amount: number; date: Date }>,
        period: "weekly" | "monthly" | "quarterly"
      ) => {
        // Use period to determine time window
        const periodMs = {
          weekly: 7 * 24 * 60 * 60 * 1000,
          monthly: 30 * 24 * 60 * 60 * 1000,
          quarterly: 90 * 24 * 60 * 60 * 1000
        }[period]

        const recent = data.filter((d) => d.date > new Date(Date.now() - periodMs))
        const previous = data.filter((d) =>
          d.date > new Date(Date.now() - 2 * periodMs) &&
          d.date <= new Date(Date.now() - periodMs)
        )

        const recentAvg = recent.reduce((sum, d) => sum + d.amount, 0) / (recent.length || 1)
        const previousAvg = previous.reduce((sum, d) => sum + d.amount, 0) / (previous.length || 1)

        const change = recentAvg - previousAvg
        const changePercent = previousAvg > 0 ? (change / previousAvg) : 0

        return {
          direction: change > 0 ? "up" : change < 0 ? "down" : "stable",
          confidence: Math.min(Math.abs(changePercent), 1), // Cap at 1.0
          forecast: recentAvg * (1 + changePercent) // Projected next period
        }
      }

      const getTrendRecommendation = (direction: string, period: string) => {
        const recommendations = {
          up: `Continue current strategies as ${period}ly trend is positive`,
          down: `Investigate causes for ${period}ly decline and adjust strategy`,
          stable: `Explore growth opportunities as ${period}ly performance is stable`
        }
        return recommendations[direction as keyof typeof recommendations] || "Monitor trends closely"
      }

      const calculateRFMSegment = (recency: number, frequency: number, monetary: number) => {
        const rScore = recency < 7 * 24 * 60 * 60 * 1000 ? 3 : recency < 30 * 24 * 60 * 60 * 1000 ? 2 : 1
        const fScore = frequency > 5 ? 3 : frequency > 2 ? 2 : 1
        const mScore = monetary > 50000 ? 3 : monetary > 10000 ? 2 : 1

        const totalScore = rScore + fScore + mScore

        if (totalScore >= 8) return "champions"
        if (totalScore >= 6) return "loyal"
        if (totalScore >= 4) return "potential"
        return "at-risk"
      }

      const groupBySegment = (segments: Array<any>) => {
        return segments.reduce((acc, segment) => {
          acc[segment.segment] = acc[segment.segment] || []
          acc[segment.segment].push(segment)
          return acc
        }, {} as Record<string, Array<any>>)
      }

      const calculateSegmentStats = (groupedSegments: Record<string, Array<any>>) => {
        return Object.entries(groupedSegments).reduce((acc, [segment, customers]) => {
          const totalRevenue = customers.reduce((sum, customer) => sum + customer.metrics.monetary, 0)
          const avgOrderValue = totalRevenue / customers.reduce((sum, customer) => sum + customer.metrics.frequency, 1)

          acc[segment] = {
            customerCount: customers.length,
            totalRevenue,
            avgOrderValue: Math.round(avgOrderValue),
            avgRecency: Math.round(customers.reduce((sum, c) => sum + c.metrics.recency, 0) / customers.length)
          }
          return acc
        }, {} as Record<string, any>)
      }

      const generateSegmentRecommendations = (segmentStats: Record<string, any>) =>
        qaService.answerQuestion(
          `Based on these customer segment statistics: ${
            JSON.stringify(segmentStats)
          }, provide targeted marketing and retention recommendations for each segment.`
        )

      const identifyTrendFactors = (trend: any, orders: Array<Order>) =>
        qaService.answerQuestion(
          `Analyze order patterns to identify factors influencing the ${trend.direction} trend. Sample orders: ${
            JSON.stringify(orders.slice(0, 3))
          }. Provide 2-3 key factors.`
        )

      const analyzeBusinessTrends = (orders: Array<Order>, users: Array<User>) =>
        qaService.answerQuestion(
          `Analyze business trends from ${orders.length} orders and ${users.length} users. Identify 3 key patterns in order amounts, customer behavior, and temporal trends.`
        )

      return {
        getKPIDashboard,
        naturalLanguageToDashboard,
        predictSalesTrends,
        segmentCustomers,
        generateBusinessInsights
      }
    })
  })
{}
