export interface SalesSummary {
  date: string;
  totalRevenue: number;
  totalTips: number;
  totalOrdersCount: number;
  closedOrdersCount: number;
  openOrdersCount: number;
  cancelledOrdersCount: number;
  averageTicket: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
}

export interface TopProductItem {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
}

export interface TopProductsReport {
  periodDays: number;
  totalDistinctProductsSold: number;
  topSelling: TopProductItem[];
  leastSelling: TopProductItem[];
}

export interface StockAlertItem {
  id: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
}

export interface StockAlertsReport {
  totalProducts: number;
  outOfStockCount: number;
  lowStockCount: number;
  healthyStockCount: number;
  outOfStockItems: StockAlertItem[];
  lowStockItems: StockAlertItem[];
}

export interface DailyForecast {
  date: string;
  dayName: string;
  projectedRevenue: number;
  projectedOrders: number;
  topExpectedDishes: { name: string; estimatedQuantity: number }[];
}

export interface ZoneOccupancy {
  zoneName: string;
  totalTables: number;
  occupied: number;
  free: number;
}

export interface TablesSummaryReport {
  totalTables: number;
  occupiedTables: number;
  freeTables: number;
  occupancyRate: string;
  zones: ZoneOccupancy[];
}

export interface AiDataContext {
  salesToday: SalesSummary;
  topProducts: TopProductsReport;
  stockAlerts: StockAlertsReport;
  tablesSummary: TablesSummaryReport;
  forecast: DailyForecast[];
}
