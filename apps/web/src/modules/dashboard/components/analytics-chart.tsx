import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

const data = [
  {
    name: "Mon",
    clicks: Math.floor(Math.random() * 900) + 100,
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    name: "Tue",
    clicks: Math.floor(Math.random() * 900) + 100,
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    name: "Wed",
    clicks: Math.floor(Math.random() * 900) + 100,
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    name: "Thu",
    clicks: Math.floor(Math.random() * 900) + 100,
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    name: "Fri",
    clicks: Math.floor(Math.random() * 900) + 100,
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    name: "Sat",
    clicks: Math.floor(Math.random() * 900) + 100,
    uniques: Math.floor(Math.random() * 700) + 80,
  },
  {
    name: "Sun",
    clicks: Math.floor(Math.random() * 900) + 100,
    uniques: Math.floor(Math.random() * 700) + 80,
  },
];

export function AnalyticsChart() {
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
