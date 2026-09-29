import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  aggregate,
  COLORS,
  formatNumber,
  formatValue,
  histogram,
  numeric,
  series,
} from "./data.js";
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

function options(widget, rows, columns, dark) {
  const text = dark ? "#a9b0c2" : "#8991a2",
    line = dark ? "#303646" : "#eff0f5";
  const { items } = series(rows, widget, columns);
  const base = {
    animationDuration: 450,
    color: [widget.color, ...COLORS.filter((c) => c !== widget.color)],
    textStyle: { fontFamily: "Inter, Segoe UI, sans-serif", color: text },
    tooltip: {
      trigger: "axis",
      renderMode: "richText",
      backgroundColor: dark ? "#252b3a" : "#fff",
      borderColor: line,
      textStyle: { color: dark ? "#eee" : "#343746" },
      confine: true,
    },
    grid: { left: 16, right: 20, top: 20, bottom: 20, containLabel: true },
  };
  if (widget.type === "pie" || widget.type === "donut")
    return {
      ...base,
      tooltip: { ...base.tooltip, trigger: "item" },
      legend: {
        bottom: 0,
        icon: "circle",
        itemWidth: 7,
        itemHeight: 7,
        textStyle: { color: text, fontSize: 11 },
      },
      series: [
        {
          type: "pie",
          radius: widget.type === "donut" ? ["55%", "75%"] : "72%",
          center: ["50%", "43%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 5,
            borderWidth: 3,
            borderColor: dark ? "#202532" : "#fff",
          },
          label: { show: false },
          emphasis: { label: { show: true, fontWeight: 600, fontSize: 14 } },
          data: items.filter((i) => i.value > 0),
        },
      ],
    };
  if (widget.type === "scatter")
    return {
      ...base,
      xAxis: {
        type: "value",
        name: widget.x,
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: line } },
      },
      yAxis: {
        type: "value",
        name: widget.y,
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: line } },
      },
      series: [
        {
          type: "scatter",
          symbolSize: 7,
          data: rows
            .map((r) => [numeric(r[widget.x]), numeric(r[widget.y])])
            .filter((pair) => pair.every((v) => v !== null))
            .slice(0, 5000),
          itemStyle: { opacity: 0.65, color: widget.color },
        },
      ],
    };
  const data = widget.type === "histogram" ? histogram(rows, widget.x) : items;
  const bar = widget.type === "bar",
    hist = widget.type === "histogram";
  const category = {
    type: "category",
    data: data.map((i) => i.name),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: text,
      fontSize: 11,
      overflow: "truncate",
      width: bar ? 105 : 75,
      interval: "auto",
    },
  };
  const value = {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: text,
      fontSize: 10,
      formatter: (v) => formatNumber(v, true),
    },
    splitLine: { lineStyle: { color: line, type: "dashed" } },
  };
  return {
    ...base,
    xAxis: bar ? value : category,
    yAxis: bar ? { ...category, inverse: true } : value,
    grid: { ...base.grid, bottom: data.length > 12 ? 45 : 20 },
    dataZoom:
      data.length > 12
        ? [
            {
              type: "inside",
              ...(bar ? { yAxisIndex: 0 } : { xAxisIndex: 0 }),
            },
            {
              type: "slider",
              height: 12,
              bottom: 0,
              ...(bar
                ? {
                    yAxisIndex: 0,
                    width: 12,
                    right: 0,
                    top: 20,
                    bottom: 20,
                    height: undefined,
                  }
                : { xAxisIndex: 0 }),
            },
          ]
        : [],
    series: [
      {
        type: bar || hist ? "bar" : "line",
        data: data.map((i) => i.value),
        smooth: 0.25,
        showSymbol: false,
        barMaxWidth: 24,
        itemStyle: {
          color: widget.color,
          borderRadius: bar ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
        lineStyle: { width: 3, color: widget.color },
        areaStyle:
          widget.type === "area"
            ? {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: widget.color + "45" },
                  { offset: 1, color: widget.color + "02" },
                ]),
              }
            : undefined,
      },
    ],
  };
}

const Chart = forwardRef(function Chart(
  { widget, rows, columns, dark, onFilter },
  ref,
) {
  const container = useRef(null),
    instance = useRef(null);
  const hasRows = rows.length > 0;
  const option = useMemo(
    () => options(widget, rows, columns, dark),
    [widget, rows, columns, dark],
  );
  const grouped = useMemo(
    () => series(rows, widget, columns),
    [rows, widget, columns],
  );
  useImperativeHandle(
    ref,
    () => ({
      image: () =>
        instance.current?.getDataURL({
          type: "png",
          pixelRatio: 2,
          backgroundColor: dark ? "#202532" : "#fff",
        }),
    }),
    [dark],
  );
  useEffect(() => {
    if (!container.current) return;
    const chart = echarts.init(container.current);
    instance.current = chart;
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(container.current);
    const beforePrint = () => chart.resize();
    window.addEventListener("beforeprint", beforePrint);
    return () => {
      resize.disconnect();
      chart.dispose();
      instance.current = null;
      window.removeEventListener("beforeprint", beforePrint);
    };
  }, [widget.type, hasRows]);
  useEffect(() => {
    instance.current?.setOption(option, true);
  }, [option, widget.type, hasRows]);
  useEffect(() => {
    const chart = instance.current;
    if (!chart) return;
    const handler = (event) => {
      if (
        onFilter &&
        ["bar", "pie", "donut"].includes(widget.type) &&
        columns.find((c) => c.name === widget.x)?.type !== "date" &&
        event.name !== "(Missing)"
      )
        onFilter(widget.x, event.name);
    };
    chart.on("click", handler);
    return () => chart.off("click", handler);
  }, [widget, columns, onFilter, hasRows]);
  if (widget.type === "kpi") {
    const value = aggregate(rows, widget.y, widget.agg);
    const date = columns.find((c) => c.type === "date");
    const trend = date
      ? series(
          rows,
          {
            ...widget,
            x: date.name,
            timeBucket: "month",
            sort: "label",
            limit: 1000,
          },
          columns,
        ).items
      : [];
    const vals = trend.map((i) => i.value ?? 0),
      max = Math.max(...vals, 1),
      min = Math.min(...vals, 0);
    const points = vals
      .map(
        (v, i) =>
          `${(i / (vals.length - 1 || 1)) * 108},${38 - ((v - min) / (max - min || 1)) * 32}`,
      )
      .join(" ");
    return (
      <div className="metric-body">
        <div>
          <div className="metric-value">{formatValue(value, widget)}</div>
          <div className="metric-note">
            <span className="metric-dot" style={{ background: widget.color }} />
            {widget.agg === "count"
              ? "All matching rows"
              : `${widget.agg === "avg" ? "Average" : widget.agg === "sum" ? "Sum" : widget.agg === "min" ? "Minimum" : "Maximum"} of ${widget.y}`}
            <span> · {formatNumber(rows.length)} rows</span>
          </div>
        </div>
        {vals.length > 1 && (
          <svg
            className="sparkline"
            viewBox="0 0 110 42"
            aria-label="Monthly trend"
          >
            <polyline
              points={points}
              fill="none"
              stroke={widget.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    );
  }
  if (!rows.length)
    return <div className="chart-empty">No rows match this filter.</div>;
  if (widget.type === "table")
    return (
      <div className="result-table">
        <table>
          <thead>
            <tr>
              <th>{widget.x}</th>
              <th>
                {widget.agg === "count"
                  ? "Rows"
                  : `${widget.y} · ${widget.agg}`}
              </th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {grouped.items.map((item) => {
              const total = grouped.items.reduce(
                (s, i) => s + (i.value ?? 0),
                0,
              );
              return (
                <tr key={item.name}>
                  <td>
                    <span
                      className="table-dot"
                      style={{ background: widget.color }}
                    />
                    {item.name}
                  </td>
                  <td>{formatValue(item.value, widget)}</td>
                  <td>
                    {widget.agg === "sum" || widget.agg === "count" ? (
                      <div className="share-track">
                        <i
                          style={{
                            width: `${Math.max(0, Math.min(100, ((item.value ?? 0) / (total || 1)) * 100))}%`,
                            background: widget.color,
                          }}
                        />
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {grouped.limited && (
          <small>
            Showing {grouped.items.length} of {grouped.total} groups. Share is
            within the displayed groups.
          </small>
        )}
      </div>
    );
  return (
    <>
      <div
        className="chart"
        ref={container}
        role="img"
        aria-label={`${widget.title}: ${widget.type} chart, ${rows.length} matching rows`}
      />
      {grouped.limited && !["scatter", "histogram"].includes(widget.type) && (
        <small className="chart-footnote">
          Showing {grouped.items.length} of {grouped.total} groups · adjust in
          chart settings
        </small>
      )}
      {["pie", "donut"].includes(widget.type) &&
        grouped.items.some((i) => i.value === null || i.value <= 0) && (
          <small className="chart-footnote">
            Only positive values appear in this chart.
          </small>
        )}
      {widget.type === "scatter" && rows.length > 5000 && (
        <small className="chart-footnote">
          Showing the first 5,000 valid points.
        </small>
      )}
    </>
  );
});
export default Chart;
