'use client';

import { Badge } from '@hms/ui';

export function PreviewBadge() {
  return (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-amber-700"
      title="This screen is a preview — responses are simulated until the AI backend ships."
    >
      Preview — simulated responses
    </Badge>
  );
}
