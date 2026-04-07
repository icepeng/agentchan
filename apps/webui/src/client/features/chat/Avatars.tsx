import { Layers, User } from "lucide-react";

export function UserAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-warm/12 flex items-center justify-center">
      <User size={13} strokeWidth={2} className="text-warm" />
    </div>
  );
}

export function AgentAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-accent/12 flex items-center justify-center">
      <Layers size={13} strokeWidth={2} className="text-accent" />
    </div>
  );
}
