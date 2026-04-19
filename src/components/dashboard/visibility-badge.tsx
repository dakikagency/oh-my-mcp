import { GlobeIcon, LockIcon, EyeIcon } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import type { Visibility } from "@/lib/schemas";

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  if (visibility === "PUBLIC") {
    return (
      <Badge variant="success" className="gap-1">
        <GlobeIcon className="h-3 w-3" /> Public
      </Badge>
    );
  }
  if (visibility === "UNLISTED") {
    return (
      <Badge variant="secondary" className="gap-1">
        <EyeIcon className="h-3 w-3" /> Unlisted
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <LockIcon className="h-3 w-3" /> Private
    </Badge>
  );
}
