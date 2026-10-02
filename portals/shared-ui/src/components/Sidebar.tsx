import { Icon, type IconName } from "../icons/Icon";
import { BrandLogo } from "../brand/BrandLogo";

export type NavItem = {
  id: string;
  label: string;
  icon: IconName;
  active?: boolean;
  badge?: number | string;
};

type Props = {
  brandSubtitle: string;
  items: NavItem[];
  roleBanner?: { title: string; subtitle: string };
  onNav?: (id: string) => void;
  onCollapse?: () => void;
  onSignOut?: () => void;
};

export function Sidebar({
  brandSubtitle,
  items,
  roleBanner,
  onNav,
  onCollapse,
  onSignOut,
}: Props) {
  return (
    <aside className="side">
      <div className="side__brand">
        <span className="side__logo">
          <BrandLogo variant="mark" />
        </span>
        <div>
          <b>EswasaOne</b>
          <span>{brandSubtitle}</span>
        </div>
      </div>
      <div className="side__authority">
        <BrandLogo variant="lockup" />
      </div>
      {roleBanner ? (
        <div className="side__role">
          <Icon name="i-check-c" />
          <div>
            <b>{roleBanner.title}</b>
            <span>{roleBanner.subtitle}</span>
          </div>
        </div>
      ) : null}
      <nav className="nav">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={item.active ? "on" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onNav?.(item.id);
            }}
          >
            <Icon name={item.icon} />
            {item.label}
            {item.badge != null ? <span className="badge">{item.badge}</span> : null}
          </a>
        ))}
      </nav>
      <div className="side__foot">
        <a
          href="#collapse"
          onClick={(e) => {
            e.preventDefault();
            onCollapse?.();
          }}
        >
          <Icon name="i-cleft" />
          Collapse
        </a>
        <a
          href="#signout"
          onClick={(e) => {
            e.preventDefault();
            onSignOut?.();
          }}
        >
          <Icon name="i-out" />
          Sign Out
        </a>
      </div>
    </aside>
  );
}
