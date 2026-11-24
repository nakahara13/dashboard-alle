export type DashboardChartPoint = { label: string; [key: string]: string | number };
export type DashboardChartSeries = {
  key: string;
  label: string;
  color: "purple" | "orange" | "green" | "rose" | "blue";
  type: "line" | "bar";
  stack?: string;
};
export type DashboardChartModel = {
  id: string;
  title: string;
  description: string;
  kind: "line" | "bar" | "composed" | "horizontal";
  format: "money" | "count";
  points: DashboardChartPoint[];
  series: DashboardChartSeries[];
  value: number | null;
  valueLabel: string;
  previousValue: number | null;
  comparisonLabel: string;
  empty: boolean;
};
