import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel";

const meta = {
  component: Carousel,
  parameters: {
    docs: {
      description: {
        component:
          "Embla-based carousel with prev/next controls, keyboard navigation, and an optional autoplay plugin (enabled by default).",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "UI/Carousel",
} satisfies Meta<typeof Carousel>;

export default meta;

type Story = StoryObj<typeof meta>;

const slides = ["One", "Two", "Three", "Four", "Five"];

function Slide({ label }: { label: string }) {
  return (
    <div className="flex aspect-square items-center justify-center rounded-md border bg-muted text-4xl font-semibold">
      {label}
    </div>
  );
}

export const Horizontal: Story = {
  render: () => (
    <Carousel autoplay={false} className="w-[320px]">
      <CarouselContent>
        {slides.map((label) => (
          <CarouselItem key={label}>
            <Slide label={label} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
};

export const WithAutoplay: Story = {
  render: () => (
    <Carousel autoplay autoplayDelay={2500} className="w-[320px]">
      <CarouselContent>
        {slides.map((label) => (
          <CarouselItem key={label}>
            <Slide label={label} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
};

export const MultiSlide: Story = {
  render: () => (
    <Carousel autoplay={false} className="w-[560px]">
      <CarouselContent className="-ml-4">
        {slides.map((label) => (
          <CarouselItem className="basis-1/3" key={label}>
            <Slide label={label} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
};
