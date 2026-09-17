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
 * itself once. `head` receives `loaderData`, which is what makes a dynamic
 * crumb possible.
 */
const AppBreadcrumbs = () => {
  const crumbs = useMatches().flatMap((match) => {
    // The root route's title is the application name. It belongs in the tab, not
    // at the head of every trail.
    if (match.routeId === rootRouteId) {
      return [];
    }

    const title = match.meta?.find((tag) => tag?.title)?.title;

    return title ? [{ id: match.id, pathname: match.pathname, title }] : [];
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <Fragment key={crumb.id}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={crumb.pathname} />}>
                    {crumb.title}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {isLast ? null : <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default AppBreadcrumbs;
