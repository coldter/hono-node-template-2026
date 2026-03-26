import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormControl } from "@/modules/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/select";

type SelectDropdownProps = {
  onValueChange?: (value: string) => void;
  defaultValue: string | undefined;
  placeholder?: string;
  isPending?: boolean;
  items: { label: string; value: string }[] | undefined;
  disabled?: boolean;
  className?: string;
  isControlled?: boolean;
};

export function SelectDropdown({
  defaultValue,
  onValueChange,
  isPending,
  items,
  placeholder,
  disabled,
  className = "",
  isControlled = false,
}: SelectDropdownProps) {
  const defaultState = isControlled
    ? { value: defaultValue, onValueChange }
    : { defaultValue, onValueChange };
  return (
    <Select {...defaultState}>
      <FormControl>
        <SelectTrigger className={cn(className)} disabled={disabled}>
          <SelectValue placeholder={placeholder ?? "Select"} />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {isPending ? (
          <SelectItem className="h-14" disabled value="loading">
            <div className="flex items-center justify-center gap-2">
              <Loader className="h-5 w-5 animate-spin" />
              {"  "}
              Loading...
            </div>
          </SelectItem>
        ) : (
          items?.map(({ label, value }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
