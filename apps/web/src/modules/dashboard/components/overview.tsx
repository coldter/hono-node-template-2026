import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

const data: { name: string; total: number }[] = [];

export function Overview() {
  return (
    <ResponsiveContainer height={350} width="100%">
      <BarChart data={data}>
        <XAxis
          axisLine={false}
          dataKey="name"
          fontSize={12}
          stroke="#888888"
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          direction="ltr"
          fontSize={12}
          stroke="#888888"
          tickFormatter={(value) => `${value}`}
          tickLine={false}
        />
        <Bar
          className="fill-primary"
          dataKey="total"
          fill="currentColor"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
