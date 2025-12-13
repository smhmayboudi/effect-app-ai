/**
 * @since 1.0.0
 * @category models
 */

import { Effect } from "effect"
import { AIServiceError, BusinessLogicError, DatabaseError } from "./Errors.js"
import { MockDatabaseService } from "./MockDatabaseService.js"
import { PGLiteQAService } from "./PGLiteQAService.js"
import type { BusinessInsight, Order, Product, User } from "./Schemas.js"

/**
 * @since 1.0.0
 * @category models
 * @description Service for providing business intelligence features including KPI monitoring, trend analysis, and customer segmentation.
 */
export class BusinessIntelligenceService
  extends Effect.Service<BusinessIntelligenceService>()("BusinessIntelligenceService", {
    effect: Effect.gen(function*() {
      const db = yield* MockDatabaseService
      const qaService = yield* PGLiteQAService

      /**
       * @description Gets the KPI dashboard with metrics, anomalies, and trends
       * @returns KPI dashboard data including metrics, anomalies, and trends
       */
      const getKPIDashboard = () =>
        Effect.gen(function*() {
          const [users, orders] = yield* Effect.all([
            db.getUsers().pipe(
              Effect.mapError((error) =>
                new DatabaseError({
                  message: "Failed to fetch users for KPI dashboard",
                  cause: error
                })
              )
            ),
            db.getOrders().pipe(
              Effect.mapError((error) =>
                new DatabaseError({
                  message: "Failed to fetch orders for KPI dashboard",
                  cause: error
                })
              )
            )
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

          const trends = yield* analyzeBusinessTrends(orders, users).pipe(
            Effect.mapError((error) =>
              new BusinessLogicError({
                message: "Failed to analyze business trends for dashboard",
                cause: error
              })
            )
          )

          return {
            anomalies: recentLargeOrders,
            overview: {
              averageOrderValue: Math.round(averageOrderValue),
              completedOrders: completedOrders.length,
              conversionRate: Math.round(conversionRate * 100) / 100,
              totalOrders: orders.length,
              totalRevenue,
              totalUsers: users.length
            },
            trends
          }
        })

      /**
       * @description Converts a natural language query to dashboard visualization with insights and recommendations
       * @param query The natural language query to analyze
       * @returns Dashboard data, insights, and recommendations based on the query
       */
      const naturalLanguageToDashboard = (query: string) =>
        Effect.gen(function*() {
          const visualizationType = yield* determineVisualizationType(query).pipe(
            Effect.mapError((error) =>
              new BusinessLogicError({
                message: "Failed to determine visualization type",
                cause: error
              })
            )
          )
          const analysis = yield* qaService.getQuestionAnalysis(query).pipe(
            Effect.mapError((error) =>
              new AIServiceError({
                message: "Failed to analyze natural language query",
                cause: error
              })
            )
          )
          const data = yield* executeAnalyticalQuery(analysis).pipe(
            Effect.mapError((error) =>
              new DatabaseError({
                message: "Failed to execute analytical query",
                cause: error
              })
            )
          )
          const insights = yield* generateDataInsights(data, query).pipe(
            Effect.mapError((error) =>
              new AIServiceError({
                message: "Failed to generate data insights from analytical query",
                cause: error
              })
            )
          )
          const suggestedActions = yield* generateRecommendedActions(insights).pipe(
            Effect.mapError((error) =>
              new AIServiceError({
                message: "Failed to generate recommended actions",
                cause: error
              })
            )
          )

          return {
            data,
            insights,
            query,
            suggestedActions,
            visualizationType
          }
        })

      /**
       * @description Predicts sales trends for a given period
       * @param period The period to predict trends for (weekly, monthly, quarterly)
       * @returns Predicted sales trends with confidence and recommendations
       */
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
          const factors = yield* identifyTrendFactors(trend, orders)
          const recommendation = getTrendRecommendation(trend.direction, period)

          return {
            confidence: Math.round(trend.confidence * 100) / 100,
            currentTrend: trend.direction,
            factors,
            forecast: Math.round(trend.forecast),
            period,
            recommendation
          }
        })

      /**
       * @description Segments customers based on RFM analysis (Recency, Frequency, Monetary)
       * @returns Customer segments with statistics and recommendations
       */
      const segmentCustomers = () =>
        Effect.gen(function*() {
          const [users, orders] = yield* Effect.all([
            db.getUsers().pipe(
              Effect.mapError((error) =>
                new DatabaseError({
                  message: "Failed to fetch users for customer segmentation",
                  cause: error
                })
              )
            ),
            db.getOrders().pipe(
              Effect.mapError((error) =>
                new DatabaseError({
                  message: "Failed to fetch orders for customer segmentation",
                  cause: error
                })
              )
            )
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
            const segment = calculateRFMSegment(recency, frequency, monetary)

            return {
              metrics: {
                frequency,
                monetary,
                recency: Math.round(recency / (24 * 60 * 60 * 1000)), // Convert to days
                totalOrders: userOrders.length
              },
              segment,
              user
            }
          })

          const groupedSegments = groupBySegment(customerSegments)
          const segmentStats = calculateSegmentStats(groupedSegments)
          const recommendations = yield* generateSegmentRecommendations(segmentStats).pipe(
            Effect.mapError((error) =>
              new AIServiceError({
                message: "Failed to generate segment recommendations",
                cause: error
              })
            )
          )

          return {
            recommendations,
            segments: groupedSegments,
            statistics: segmentStats
          }
        })

      /**
       * @description Generates comprehensive business insights from multiple data sources
       * @returns Array of business insights with recommendations and visualizations
       */
      const generateBusinessInsights = () =>
        Effect.gen(function*() {
          const [dashboard, segments, trends] = yield* Effect.all([
            getKPIDashboard(),
            segmentCustomers(),
            predictSalesTrends()
          ], { concurrency: 3 }).pipe(
            Effect.mapError((error) =>
              new BusinessLogicError({
                message: "Failed to generate business insights from multiple sources",
                cause: error
              })
            )
          )

          const insights: Array<BusinessInsight> = []

          // Revenue insights - using dashboard data
          if (dashboard.overview.totalRevenue > 100000) {
            insights.push({
              data: [],
              description: `Company has exceeded $${
                Math.round(dashboard.overview.totalRevenue / 1000)
              }K in total revenue`,
              id: "high-revenue",
              metrics: [
                { label: "Average Order Value", value: dashboard.overview.averageOrderValue, unit: "$" },
                { label: "Conversion Rate", value: dashboard.overview.conversionRate, unit: "%" },
                { label: "Total Revenue", value: dashboard.overview.totalRevenue, unit: "$" }
              ],
              recommendations: [
                "Consider expanding high-value product lines",
                "Evaluate customer acquisition costs for optimization"
              ],
              severity: "info",
              title: "Strong Revenue Performance",
              visualization: "metric"
            })
          }

          // Anomaly insights - using dashboard anomalies
          if (dashboard.anomalies.length > 0) {
            insights.push({
              data: dashboard.anomalies.map((order) => ({
                amount: order.amount,
                customer: order.customer_id,
                description: order.description,
                id: order.id
              })),
              description: `${dashboard.anomalies.length} high-value orders in the past week`,
              id: "large-orders",
              metrics: [
                { label: "Large Orders", value: dashboard.anomalies.length },
                { label: "Total Value", value: dashboard.anomalies.reduce((sum, o) => sum + o.amount, 0), unit: "$" }
              ],
              recommendations: [
                "Analyze what drove these large purchases",
                "Follow up with customers for repeat business"
              ],
              severity: "medium",
              title: "Recent Large Orders Detected",
              visualization: "bar"
            })
          }

          // Customer segment insights - using segments data
          const championCount = segments.segments.champions?.length || 0
          if (championCount > 0) {
            insights.push({
              data: Object.entries(segments.statistics).map(([segment, stats]) => ({
                customerCount: stats.customerCount,
                segment,
                totalRevenue: stats.totalRevenue
              })),
              description: `${championCount} champion customers driving significant revenue`,
              id: "champion-customers",
              metrics: [
                { label: "Champion Customers", value: championCount },
                { label: "Segment Revenue", value: segments.statistics.champions?.totalRevenue || 0, unit: "$" }
              ],
              recommendations: [
                "Create exclusive offers for champion customers",
                "Develop loyalty program for high-value segments"
              ],
              severity: "high",
              title: "High-Value Customer Segment Identified",
              visualization: "pie"
            })
          }

          // Trend insights - using trends data
          if (trends.currentTrend === "up") {
            insights.push({
              data: [],
              description: `Sales showing ${trends.currentTrend}ward trend with ${
                (trends.confidence * 100).toFixed(1)
              }% confidence`,
              id: "positive-trend",
              metrics: [
                { label: "Confidence", value: trends.confidence * 100, unit: "%" },
                { label: "Next Period Forecast", value: trends.forecast, unit: "$" },
                { label: "Trend Direction", value: trends.currentTrend === "up" ? 1 : -1 }
              ],
              recommendations: [trends.recommendation],
              severity: "info",
              title: "Positive Sales Trend Detected",
              visualization: "line"
            })
          }

          return insights
        })

      /**
       * @description Helper function to determine the appropriate visualization type for a query
       * @param query The query to analyze for visualization type
       * @returns The appropriate visualization type (bar, line, pie, table, metric)
       */
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

      /**
       * @description Executes an analytical query based on the entities identified in the analysis
       * @param analysis The analysis object containing entities
       * @returns The data based on the entities in the analysis
       */
      const executeAnalyticalQuery = (analysis: { entities?: Array<string> }) =>
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

      /**
       * @description Generates data insights from the provided data and original query
       * @param data The data to analyze
       * @param originalQuery The original query that triggered the analysis
       * @returns Insights generated from the data and query
       */
      const generateDataInsights = (data: Array<User> | Array<Order> | Array<Product>, originalQuery: string) =>
        qaService.answerQuestion(
          `Analyze this business data and provide 3 key insights. Data sample: ${
            JSON.stringify(data.slice(0, 5))
          }. Original question: ${originalQuery}. Keep insights concise.`
        ).pipe(
          Effect.mapError((error) =>
            new AIServiceError({
              message: "Failed to generate data insights",
              cause: error
            })
          )
        )

      /**
       * @description Generates recommended actions based on the provided insights
       * @param insights The insights to generate recommendations from
       * @returns Recommended actions based on the insights
       */
      const generateRecommendedActions = (insights: string) =>
        qaService.answerQuestion(
          `Based on these insights: ${insights}, suggest 2-3 actionable business recommendations. Return as a simple list.`
        )

      /**
       * @description Calculates the trend based on historical data and period
       * @param data The historical data to analyze
       * @param period The period for trend analysis (weekly, monthly, quarterly)
       * @returns Trend information including confidence, direction, and forecast
       */
      const calculateTrend = (
        data: Array<{ amount: number; date: Date }>,
        period: "weekly" | "monthly" | "quarterly"
      ) => {
        // Use period to determine time window
        const periodMs = {
          monthly: 30 * 24 * 60 * 60 * 1000,
          quarterly: 90 * 24 * 60 * 60 * 1000,
          weekly: 7 * 24 * 60 * 60 * 1000
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
          confidence: Math.min(Math.abs(changePercent), 1), // Cap at 1.0
          direction: change > 0 ? "up" : change < 0 ? "down" : "stable",
          forecast: recentAvg * (1 + changePercent) // Projected next period
        }
      }

      /**
       * @description Gets trend recommendations based on direction and period
       * @param direction The trend direction (up, down, stable)
       * @param period The period for recommendations
       * @returns Recommendations based on the trend
       */
      const getTrendRecommendation = (direction: string, period: string) => {
        const recommendations = {
          down: `Investigate causes for ${period}ly decline and adjust strategy`,
          stable: `Explore growth opportunities as ${period}ly performance is stable`,
          up: `Continue current strategies as ${period}ly trend is positive`
        }

        return recommendations[direction as keyof typeof recommendations] || "Monitor trends closely"
      }

      /**
       * @description Calculates the R(F)M segment based on recency, frequency, and monetary values
       * @param recency The recency score
       * @param frequency The frequency score
       * @param monetary The monetary score
       * @returns The calculated segment (champions, loyal, potential, at-risk)
       */
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

      /**
       * @description Groups customer segments by their segment type
       * @param segments The customer segments to group
       * @returns Segments grouped by their segment type
       */
      const groupBySegment = (
        segments: Array<{
          metrics: {
            frequency: number
            monetary: number
            recency: number
            totalOrders: number
          }
          segment: string
          user: {
            readonly department: string
            readonly email: string
            readonly id: number
            readonly name: string
            readonly role: string
          }
        }>
      ) => {
        return segments.reduce((acc, segment) => {
          acc[segment.segment] = acc[segment.segment] || []
          acc[segment.segment].push(segment)
          return acc
        }, {} as Record<
          string,
          Array<{
            metrics: {
              frequency: number
              monetary: number
              recency: number
              totalOrders: number
            }
            segment: string
            user: {
              readonly department: string
              readonly email: string
              readonly id: number
              readonly name: string
              readonly role: string
            }
          }>
        >)
      }

      /**
       * @description Calculates statistics for each segment
       * @param groupedSegments The segments grouped by type
       * @returns Statistics for each segment type
       */
      const calculateSegmentStats = (
        groupedSegments: Record<
          string,
          Array<{
            metrics: {
              frequency: number
              monetary: number
              recency: number
              totalOrders: number
            }
            segment: string
            user: {
              readonly department: string
              readonly email: string
              readonly id: number
              readonly name: string
              readonly role: string
            }
          }>
        >
      ) => {
        return Object.entries(groupedSegments).reduce((acc, [segment, customers]) => {
          const totalRevenue = customers.reduce((sum, customer) => sum + customer.metrics.monetary, 0)
          const avgOrderValue = totalRevenue / customers.reduce((sum, customer) => sum + customer.metrics.frequency, 1)

          acc[segment] = {
            avgOrderValue: Math.round(avgOrderValue),
            avgRecency: Math.round(customers.reduce((sum, c) => sum + c.metrics.recency, 0) / customers.length),
            customerCount: customers.length,
            totalRevenue
          }

          return acc
        }, {} as Record<string, {
          avgOrderValue: number
          avgRecency: number
          customerCount: number
          totalRevenue: number
        }>)
      }

      /**
       * @description Generates recommendations for each segment based on statistics
       * @param segmentStats Statistical information about the segments
       * @returns Recommendations for each segment based on the statistics
       */
      const generateSegmentRecommendations = (
        segmentStats: Record<string, {
          avgOrderValue: number
          avgRecency: number
          customerCount: number
          totalRevenue: number
        }>
      ) =>
        qaService.answerQuestion(
          `Based on these customer segment statistics: ${
            JSON.stringify(segmentStats)
          }, provide targeted marketing and retention recommendations for each segment.`
        )

      /**
       * @description Identifies factors influencing a particular trend
       * @param trend The trend information to analyze
       * @param orders The orders to analyze for factor identification
       * @returns Key factors influencing the specified trend
       */
      const identifyTrendFactors = (trend: {
        confidence: number
        direction: string
        forecast: number
      }, orders: Array<Order>) =>
        qaService.answerQuestion(
          `Analyze order patterns to identify factors influencing the ${trend.direction} trend. Sample orders: ${
            JSON.stringify(orders.slice(0, 3))
          }. Provide 2-3 key factors.`
        )

      /**
       * @description Analyzes business trends from orders and users
       * @param orders The orders to analyze
       * @param users The users to analyze
       * @returns Analysis of business trends
       */
      const analyzeBusinessTrends = (orders: Array<Order>, users: Array<User>) =>
        qaService.answerQuestion(
          `Analyze business trends from ${orders.length} orders and ${users.length} users. Identify 3 key patterns in order amounts, customer behavior, and temporal trends.`
        )

      return {
        /**
         * @description Gets the KPI dashboard with metrics, anomalies, and trends
         */
        getKPIDashboard,
        /**
         * @description Converts a natural language query to dashboard visualization with insights and recommendations
         */
        naturalLanguageToDashboard,
        /**
         * @description Predicts sales trends for a given period
         */
        predictSalesTrends,
        /**
         * @description Segments customers based on RFM analysis (Recency, Frequency, Monetary)
         */
        segmentCustomers,
        /**
         * @description Generates comprehensive business insights from multiple data sources
         */
        generateBusinessInsights
      }
    })
  })
{}
