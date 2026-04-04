import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Eye,
  KeyRound,
  List,
  LogIn,
  LogOut,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Unlock,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  UserX,
} from "lucide-react";
import { getEventIconName } from "./event-utils";

const iconMap: Record<string, LucideIcon> = {
  Activity,
  Eye,
  KeyRound,
  List,
  LogIn,
  LogOut,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Unlock,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  UserX,
};

type EventIconProps = {
  event: string;
  className?: string;
};

export function EventIcon({ event, className }: EventIconProps) {
  const iconName = getEventIconName(event);
  const Icon = iconMap[iconName] ?? Activity;
  return <Icon className={className} />;
}
