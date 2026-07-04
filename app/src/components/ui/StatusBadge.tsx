import { FC } from "react";
import { getStatusVisual, type AnyOrderStatus } from "@/lib/order-status";

export const StatusBadge: FC<{ status: AnyOrderStatus | string; className?: string }> = ({
  status,
  className = "",
}) => {
  const visual = getStatusVisual(status);
  const { Icon } = visual;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-[var(--radius-full)] border ${visual.bg} ${visual.border} ${visual.text} ${className}`}
    >
      <Icon className={`w-3.5 h-3.5 ${visual.icon}`} />
      {visual.label}
    </span>
  );
};

export const StatusIcon: FC<{ status: AnyOrderStatus | string; className?: string }> = ({
  status,
  className = "w-5 h-5",
}) => {
  const { Icon, icon } = getStatusVisual(status);
  return <Icon className={`${className} ${icon}`} />;
};
