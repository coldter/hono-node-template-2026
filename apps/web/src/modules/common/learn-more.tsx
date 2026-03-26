import type { Content, Root, Trigger } from "@radix-ui/react-popover";
import { CircleQuestionMark } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/modules/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/modules/ui/popover";

type LearnMoreProps = React.ComponentProps<typeof Root> & {
  contentProps?: React.ComponentProps<typeof Content>;
  triggerProps?: React.ComponentProps<typeof Trigger>;
};

export function LearnMore({
  children,
  contentProps,
  triggerProps,
  ...props
}: LearnMoreProps) {
  return (
    <Popover {...props}>
      <PopoverTrigger
        asChild
        {...triggerProps}
        className={cn("size-5 rounded-full", triggerProps?.className)}
      >
        <Button size="icon" variant="outline">
          <span className="sr-only">Learn more</span>
          <CircleQuestionMark className="size-4 [&>circle]:hidden" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        {...contentProps}
        className={cn("text-muted-foreground text-sm", contentProps?.className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
