import { zodResolver } from "@hookform/resolvers/zod";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "./button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./form";
import { Input } from "./input";
import { Textarea } from "./textarea";

const schema = z.object({
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(32, "Username must be at most 32 characters"),
  bio: z.string().max(160, "Bio must be 160 characters or fewer").optional(),
});

type FormValues = z.infer<typeof schema>;

type DemoFormProps = {
  defaultValues?: Partial<FormValues>;
  disabled?: boolean;
  forceErrors?: boolean;
};

function DemoForm({ defaultValues, disabled, forceErrors }: DemoFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: defaultValues?.username ?? "",
      bio: defaultValues?.bio ?? "",
    },
    mode: "onChange",
  });

  if (forceErrors) {
    form.setError("username", {
      type: "manual",
      message: "Username is already taken",
    });
  }

  return (
    <Form {...form}>
      <form
        className="grid w-80 gap-4"
        onSubmit={form.handleSubmit(() => {
          // story-only: no submission side effect
        })}
      >
        <FormField
          control={form.control}
          disabled={disabled}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="shadcn" {...field} />
              </FormControl>
              <FormDescription>Your public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          disabled={disabled}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Tell us a little about yourself"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button disabled={disabled} type="submit">
          Submit
        </Button>
      </form>
    </Form>
  );
}

const meta = {
  title: "UI/Form",
  component: DemoForm,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Form primitives wired to react-hook-form. Compose FormField, FormItem, FormLabel, FormControl, FormDescription, and FormMessage to wire up accessible, validated inputs. Stories below use a zod resolver.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
    forceErrors: { control: "boolean" },
  },
} satisfies Meta<typeof DemoForm>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Prefilled: Story = {
  args: {
    defaultValues: { username: "kuldeep", bio: "Building things on the web." },
  },
};

export const ValidationError: Story = {
  args: {
    defaultValues: { username: "a" },
    forceErrors: true,
  },
};

export const Disabled: Story = {
  args: {
    defaultValues: { username: "readonly", bio: "Cannot edit this form." },
    disabled: true,
  },
};
