import type { ReactNode } from "react";
import { IconSprite } from "../icons/Icon";

type Props = {
  children: ReactNode;
  /** Extra classes on the grid root, e.g. app--nav-open / app--side-collapsed. */
  className?: string;
};

/** App grid shell + icon sprite. */
export function AppShell({ children, className }: Props) {
  return (
    <div className={className ? `app ${className}` : "app"}>
      <IconSprite />
      {children}
    </div>
  );
}
