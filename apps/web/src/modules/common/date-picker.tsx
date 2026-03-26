import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/modules/ui/button";
import { Calendar } from "@/modules/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/modules/ui/popover";

type DatePickerProps = {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  placeholder?: string;
};

export function DatePicker({
  selected,
  onSelect,
  placeholder = "Pick a date",
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="data-[empty=true]:text-muted-foreground w-[240px] justify-start text-start font-normal"
          data-empty={!selected}
          variant="outline"
        >
          {selected ? (
            format(selected, "MMM d, yyyy")
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarIcon className="ms-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          captionLayout="dropdown"
          disabled={(date: Date) =>
            date > new Date() || date < new Date("1900-01-01")
          }
          mode="single"
          onSelect={onSelect}
          selected={selected}
        />
      </PopoverContent>
    </Popover>
  );
}
