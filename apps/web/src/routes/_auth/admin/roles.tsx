import { APP_ROLES, hasPermission, statement } from "@k22i/auth/permissions";
import type { Statement } from "@k22i/auth/permissions";
import { Badge } from "@k22i/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@k22i/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@k22i/ui/components/table";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Static config: every cell is `hasPermission` over `@k22i/auth/permissions`,
 * the same data the server enforces with. These are per-organization
 * `member.role`, not the global `user.role`.
 */
const RouteComponent = () => (
  <div className="space-y-6">
    <h1 className="font-heading text-2xl font-semibold">Roles</h1>

    {(Object.entries(statement) as [keyof Statement, readonly string[]][]).map(
      ([resource, actions]) => (
        <Card key={resource}>
          <CardHeader>
            <CardTitle>
              <span className="font-mono text-base">{resource}</span>
            </CardTitle>
            <CardDescription>
              {actions.length} action{actions.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardPanel>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  {APP_ROLES.map((role) => (
                    <TableHead className="text-center" key={role}>
                      {role}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {actions.map((action) => (
                  <TableRow key={action}>
                    <TableCell>
                      <span className="font-mono text-xs">{action}</span>
                    </TableCell>
                    {APP_ROLES.map((role) => {
                      const granted = hasPermission({
                        permissions: { [resource]: [action] },
                        role,
                      });
                      return (
                        <TableCell className="text-center" key={role}>
                          {granted ? (
                            <Badge variant="default">yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardPanel>
        </Card>
      )
    )}
  </div>
);

export const Route = createFileRoute("/_auth/admin/roles")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Roles" }] }),
});
