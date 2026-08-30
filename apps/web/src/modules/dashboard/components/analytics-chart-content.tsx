import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

const data = [
  {
    clicks: Math.floor(Math.random() * 900) + 100,
    name: "Mon",
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    clicks: Math.floor(Math.random() * 900) + 100,
    name: "Tue",
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    clicks: Math.floor(Math.random() * 900) + 100,
    name: "Wed",
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    clicks: Math.floor(Math.random() * 900) + 100,
    name: "Thu",
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    clicks: Math.floor(Math.random() * 900) + 100,
    name: "Fri",
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    clicks: Math.floor(Math.random() * 900) + 100,
    name: "Sat",
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    clicks: Math.floor(Math.random() * 900) + 100,
    name: "Sun",
    uniques: Math.floor(Math.random() * 700) + 80,
  },
];

export function AnalyticsChartContent() {
  return (
    <ResponsiveContainer height={300} width="100%">
      <AreaChart data={data}>
        <XAxis
          axisLine={false}
          dataKey="name"
          fontSize={12}
          stroke="#888888"
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          fontSize={12}
          stroke="#888888"
          tickLine={false}
        />
        <Area
          className="text-primary"
          dataKey="clicks"
          fill="currentColor"
          fillOpacity={0.15}
          stroke="currentColor"
          type="monotone"
        />
        <Area
          className="text-muted-foreground"
          dataKey="uniques"
          fill="currentColor"
          fillOpacity={0.1}
          stroke="currentColor"
          type="monotone"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
