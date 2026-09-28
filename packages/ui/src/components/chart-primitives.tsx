/**
 * The recharts building blocks the apps compose with `ChartContainer` from
 * `chart.tsx`. Re-exported here so recharts stays an `@hms/ui` detail, like
 * Radix behind the other components: `apps/web` imports charts from this
 * package and never from recharts itself.
 */
export {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
