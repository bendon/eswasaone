import type { ReactNode } from "react";
import { IconSprite } from "../icons/Icon";

type Props = {
  children: ReactNode;
};

/** App grid shell + icon sprite. */
export function AppShell({ children }: Props) {
  return (
    <div className="app">
      <IconSprite />
      {children}
    </div>
  );
}
