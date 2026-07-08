import { FC, HTMLAttributes } from "react";

export const Card: FC<HTMLAttributes<HTMLDivElement>> = ({
  className = "",
  ...props
}) => (
  <div
    className={`bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-6 md:p-8 card-elevated ${className}`}
    {...props}
  />
);
