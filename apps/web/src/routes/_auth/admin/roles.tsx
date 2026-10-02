import { APP_ROLES, hasPermission, statement } from "@masdan/auth/permissions";
import type { Statement } from "@masdan/auth/permissions";
import { Badge } from "@masdan/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { createFileRoute } from "@tanstack/react-router";

const RouteComponent = () => (
  <div className="space-y-6">
    <h1 className="text-2xl font-bold">Roles</h1>

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
