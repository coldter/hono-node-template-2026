import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "./label";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const meta = {
  title: "UI/RadioGroup",
  component: RadioGroup,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Mutually-exclusive selection control built on Radix RadioGroup. Use RadioGroupItem inside RadioGroup for each option; works with defaultValue or value for controlled usage.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    defaultValue: { control: "text" },
    disabled: { control: "boolean" },
    orientation: {
      control: "radio",
      options: ["horizontal", "vertical"],
    },
  },
  args: {
    defaultValue: "comfortable",
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

const options = [
  { value: "default", label: "Default" },
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
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
  args: { disabled: true },
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
