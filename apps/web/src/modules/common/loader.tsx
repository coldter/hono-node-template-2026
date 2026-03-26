import { Spinner } from "@/modules/ui/spinner";

export default function Loader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <Spinner size="md" />
    </div>
  );
}
