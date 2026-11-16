import { formatMoney, formatMonth } from "@/lib/format";

const PLOT_HEIGHT = 176;
const TICK_COUNT = 4;

/** Rounds the top of the axis up to a clean 1, 2, 2.5 or 5 multiple of a power of ten. */
function niceStep(max: number) {
  const raw = max / TICK_COUNT || 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 5, 10].find((f) => f * magnitude >= raw) ?? 10;
  return factor * magnitude;
}

function compact(value: number) {
  return value >= 10_000 ? `${value / 1000}K` : value.toLocaleString("th-TH");
}

export function MonthlySalesChart({ data }: { data: { month: string; sales: number }[] }) {
  const step = niceStep(Math.max(...data.map((d) => d.sales)));
  const axisMax = step * TICK_COUNT;
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => i * step);

  return (
    <>
      <div className="mt-4 flex gap-2" aria-hidden="true">
        <div className="relative w-10 shrink-0" style={{ height: PLOT_HEIGHT }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2 text-xs text-muted tabular-nums"
              style={{ bottom: (tick / axisMax) * PLOT_HEIGHT }}
            >
              {compact(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 h-px bg-line"
                style={{ bottom: (tick / axisMax) * PLOT_HEIGHT }}
              />
            ))}
            <div className="absolute inset-0 flex">
              {data.map(({ month, sales }, index) => (
                <div
                  key={month}
                  tabIndex={0}
                  className="group relative flex flex-1 items-end justify-center outline-none hover:bg-paper/70 focus:bg-paper/70"
                >
                  <div
                    className="w-full max-w-8 rounded-t-md bg-gradient-to-t from-accent to-series transition-opacity group-hover:opacity-85"
                    style={{ height: (sales / axisMax) * PLOT_HEIGHT }}
                  />
                  <div
                    className={`pointer-events-none absolute top-1 z-10 hidden rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white group-hover:block group-focus:block ${
                      index >= data.length / 2 ? "right-1" : "left-1"
                    }`}
                  >
                    {formatMonth(month)}: {formatMoney(sales)} บาท
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex">
            {data.map(({ month }) => (
              <span key={month} className="flex-1 text-center text-xs text-muted">
                {formatMonth(month)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>ยอดขายรายเดือน ก่อน VAT</caption>
        <tbody>
          {data.map(({ month, sales }) => (
            <tr key={month}>
              <th scope="row">{formatMonth(month)}</th>
              <td>{formatMoney(sales)} บาท</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
