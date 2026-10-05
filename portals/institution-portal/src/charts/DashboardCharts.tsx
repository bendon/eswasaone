import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { fontSans } from "@eswasaone/shared-ui/system";
import { EmptyState } from "../components/PageStates";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
);

ChartJS.defaults.font.family = fontSans;
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = "#98A2B3";

const gridColor = "#EFF2F7";

export type FinanceMonths = {
  labels: string[];
  budget_thousands: number[];
  actual_thousands: number[];
};

type Props = {
  months?: FinanceMonths | null;
  variancePct?: number | null;
  /** Hide ops line chart (e.g. finance page). Kept for callers; ops series needs a live API. */
  showOpsLine?: boolean;
};

export function DashboardCharts({ months, variancePct }: Props) {
  const hasSeries =
    Boolean(months?.labels?.length) &&
    Boolean(months?.budget_thousands?.length) &&
    Boolean(months?.actual_thousands?.length);

  if (!hasSeries) {
    return (
      <EmptyState
        title="No chart data yet"
        detail="Revenue vs budget appears once finance KPIs return monthly series."
      />
    );
  }

  const labels = months!.labels;
  const budget = months!.budget_thousands;
  const actual = months!.actual_thousands;
  const variance =
    variancePct == null || Number.isNaN(variancePct) ? null : variancePct;
  const varianceLabel =
    variance == null
      ? "● Live series"
      : variance < 0
        ? `● ${Math.abs(variance).toFixed(0)}% below budget`
        : `● ${variance.toFixed(0)}% vs budget`;

  return (
    <div className="row c2a">
      <div className="panel">
        <div className="panel__h">
          <div>
            <h3>Revenue vs Budget</h3>
            <p>Monthly SZL (thousands)</p>
          </div>
          <span className="tagpill">{varianceLabel}</span>
        </div>
        <div className="chart-wrap">
          <Bar
            data={{
              labels,
              datasets: [
                {
                  label: "Budget",
                  data: budget,
                  backgroundColor: "#AEB8C7",
                  borderRadius: 4,
                  barPercentage: 0.7,
                  categoryPercentage: 0.7,
                },
                {
                  label: "Actual",
                  data: actual,
                  backgroundColor: "#C48F20",
                  borderRadius: 4,
                  barPercentage: 0.7,
                  categoryPercentage: 0.7,
                },
              ],
            }}
            options={{
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { display: false } },
                y: {
                  grid: { color: gridColor },
                  ticks: { callback: (v) => `${v}k` },
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
