import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const meta = {
  args: {
    defaultValue: "comfortable",
  },
  argTypes: {
    defaultValue: { control: "text" },
    disabled: { control: "boolean" },
    orientation: {
      control: "radio",
      options: ["horizontal", "vertical"],
    },
  },
  component: RadioGroup,
  parameters: {
    docs: {
      description: {
        component:
          "Mutually-exclusive selection control built on Radix RadioGroup. Use RadioGroupItem inside RadioGroup for each option; works with defaultValue or value for controlled usage.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/RadioGroup",
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

const options = [
  { label: "Default", value: "default" },
  { label: "Comfortable", value: "comfortable" },
  { label: "Compact", value: "compact" },
] as const;

export const Default: Story = {
  render: (args) => (
    <RadioGroup {...args}>
      {options.map((option) => (
        <div className="flex items-center gap-2" key={option.value}>
          <RadioGroupItem id={`rg-${option.value}`} value={option.value} />
          <Label htmlFor={`rg-${option.value}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: (args) => (
    <RadioGroup {...args} className="flex gap-4">
      {options.map((option) => (
        <div className="flex items-center gap-2" key={option.value}>
          <RadioGroupItem id={`rg-h-${option.value}`} value={option.value} />
          <Label htmlFor={`rg-h-${option.value}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <RadioGroup {...args}>
      {options.map((option) => (
        <div className="flex items-center gap-2" key={option.value}>
          <RadioGroupItem id={`rg-d-${option.value}`} value={option.value} />
          <Label htmlFor={`rg-d-${option.value}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};

export const Invalid: Story = {
  render: (args) => (
    <RadioGroup {...args}>
      {options.map((option) => (
        <div className="flex items-center gap-2" key={option.value}>
          <RadioGroupItem
            aria-invalid
            id={`rg-i-${option.value}`}
            value={option.value}
          />
          <Label htmlFor={`rg-i-${option.value}`}>{option.label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
};
