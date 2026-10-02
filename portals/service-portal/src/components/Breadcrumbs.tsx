import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@eswasaone/shared-ui";

export type Crumb = {
  label: string;
  /** Omit (or leave undefined) on the current page. */
  to?: string;
};

type Props = {
  items: Crumb[];
};

/** Home → … → current. Used on every Service Portal page except Home. */
export function Breadcrumbs({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <nav className="crumb" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const node =
          last || !item.to ? (
            <strong key={`label-${i}`}>{item.label}</strong>
          ) : (
            <Link key={`label-${i}`} to={item.to}>
              {item.label}
            </Link>
          );

        if (i === 0) return node;

        return (
          <Fragment key={`seg-${i}`}>
            <Icon name="i-cright" />
            {node}
          </Fragment>
        );
      })}
    </nav>
  );
}
