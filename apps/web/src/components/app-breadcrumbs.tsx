import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@masdan/ui/components/breadcrumb";
import { Link, rootRouteId, useMatches } from "@tanstack/react-router";
import { Fragment } from "react";

/**
 * Crumbs come from each matched route's `head()` title, so a screen names
 * itself once. On a phone only the current title shows, with a back arrow to
 * its parent; wider screens get the whole trail.
 */
const AppBreadcrumbs = () => {
  const crumbs = useMatches().flatMap((match) => {
    // The root route's title is the product name — for the tab, not the trail.
    if (match.routeId === rootRouteId) {
      return [];
    }
    const title = match.meta?.find((tag) => tag?.title)?.title;
    return title ? [{ id: match.id, pathname: match.pathname, title }] : [];
  });
  // A layout and its index route often share a title; show it once.
  const trail = crumbs.filter(
    (crumb, index) => crumb.title !== crumbs[index - 1]?.title
  );
  const parent = trail.at(-2);

  return (
    <div className="flex min-w-0 items-center gap-1">
      {parent ? (
        <Link
          aria-label={`Back to ${parent.title}`}
          className="text-brand-text hover:bg-accent focus-visible:ring-ring/50 -ms-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-3 sm:hidden"
          to={parent.pathname}
        >
          <HugeiconsIcon
            className="size-5"
            icon={ArrowLeft01Icon}
            strokeWidth={2}
          />
        </Link>
      ) : null}
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;
            return (
              <Fragment key={crumb.id}>
                <BreadcrumbItem
                  className={isLast ? "min-w-0" : "hidden sm:inline-flex"}
                >
                  {isLast ? (
                    <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link to={crumb.pathname} />}>
                      {crumb.title}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {isLast ? null : (
                  <BreadcrumbSeparator className="hidden sm:inline-flex" />
                )}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
};

export default AppBreadcrumbs;
