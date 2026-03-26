import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { listRoles } from "@/api.gen/sdk.gen";
import { cn } from "@/lib/utils";
import { Badge } from "@/modules/ui/badge";
import { Button } from "@/modules/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/modules/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/modules/ui/popover";

interface RoleMultiSelectProps {
  onChange: (value: string[]) => void;
  value: string[];
}

export function RoleMultiSelect({ value, onChange }: RoleMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const { data: rolesData, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const response = await listRoles();
      return response.roles;
    },
  });

  const roles = rolesData ?? [];

  const toggleRole = (roleSlug: string) => {
    if (value.includes(roleSlug)) {
      onChange(value.filter((v) => v !== roleSlug));
    } else {
      onChange([...value, roleSlug]);
    }
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="w-full justify-between"
          disabled={isLoading}
          role="combobox"
          variant="outline"
        >
          {value.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {value.map((slug) => (
                <Badge className="capitalize" key={slug} variant="secondary">
                  {roles.find((r) => r.slug === slug)?.name ?? slug}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">Select roles...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search roles..." />
          <CommandList>
            <CommandEmpty>No roles found.</CommandEmpty>
            <CommandGroup>
              {roles.map((role) => (
                <CommandItem
                  key={role.slug}
                  onSelect={() => toggleRole(role.slug)}
                  value={role.slug}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.includes(role.slug) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{role.name}</span>
                    {role.description && (
                      <span className="text-muted-foreground text-xs">
                        {role.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
