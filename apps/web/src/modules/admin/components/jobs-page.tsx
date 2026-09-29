import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Field, FieldLabel } from "@masdan/ui/components/field";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import type { UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { z } from "zod";

import { FieldErrors } from "@/components/field-errors";
import { formatDateTime } from "@/lib/dates";
import { orpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

type RegistryResult = RouterOutputs["admin"]["jobs"]["registry"];
type CountsResult = RouterOutputs["admin"]["jobs"]["counts"];
type RecentResult = RouterOutputs["admin"]["jobs"]["recent"];
type SchedulesResult = RouterOutputs["admin"]["jobs"]["schedules"];

const jobStateBadgeVariant = (state: string) => {
  if (state === "completed") {
    return "default" as const;
  }
  if (state === "failed") {
    return "error" as const;
  }
  return "outline" as const;
};

const RegistryCard = ({
  counts,
  registry,
}: {
  counts: UseQueryResult<CountsResult>;
  registry: UseQueryResult<RegistryResult>;
}) => {
  const countsFor = (name: string) =>
    (counts.data ?? []).filter((row) => row.name === name);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registry</CardTitle>
      </CardHeader>
      <CardPanel>
        {registry.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Counts by state</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registry.data?.map((job) => (
                <TableRow key={job.name}>
                  <TableCell>
                    <span className="font-mono text-xs">{job.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {job.cron ? job.cron.expression : "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {countsFor(job.name).length === 0 ? (
                        <span className="text-muted-foreground text-xs">
                          none
                        </span>
                      ) : (
                        countsFor(job.name).map((row) => (
                          <Badge key={row.state} variant="outline">
                            {row.state}: {row.count}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardPanel>
    </Card>
  );
};

const RecentJobsCard = ({
  recent,
}: {
  recent: UseQueryResult<RecentResult>;
}) => {
  let body: React.ReactNode;
  if (recent.isPending) {
    body = <Skeleton className="h-64 w-full" />;
  } else if (recent.data && recent.data.length > 0) {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Retries</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recent.data.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <span className="font-mono text-xs">{job.name}</span>
              </TableCell>
              <TableCell>
                <Badge variant={jobStateBadgeVariant(job.state)}>
                  {job.state}
                </Badge>
              </TableCell>
              <TableCell>{job.retryCount}</TableCell>
              <TableCell>
                <span className="text-xs">{formatDateTime(job.createdOn)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else {
    body = (
      <Empty>
        <EmptyTitle>No jobs yet</EmptyTitle>
        <EmptyDescription>
          Nothing has been enqueued in this environment.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent jobs</CardTitle>
        <CardDescription>Most recent 50, any state.</CardDescription>
      </CardHeader>
      <CardPanel>{body}</CardPanel>
    </Card>
  );
};

const SchedulesCard = ({
  schedules,
}: {
  schedules: UseQueryResult<SchedulesResult>;
}) => {
  let body: React.ReactNode;
  if (schedules.isPending) {
    body = <Skeleton className="h-32 w-full" />;
  } else if (schedules.data && schedules.data.length > 0) {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Cron</TableHead>
            <TableHead>Timezone</TableHead>
            <TableHead>Registry</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.data.map((schedule) => (
            <TableRow key={schedule.name}>
              <TableCell>
                <span className="font-mono text-xs">{schedule.name}</span>
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs">{schedule.cron}</span>
              </TableCell>
              <TableCell>
                <span className="text-xs">{schedule.timezone}</span>
              </TableCell>
              <TableCell>
                {schedule.inRegistry ? (
                  <Badge variant="default">in sync</Badge>
                ) : (
                  <Badge variant="warning">orphaned</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else {
    body = (
      <p className="text-muted-foreground text-sm">No cron jobs registered.</p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedules</CardTitle>
      </CardHeader>
      <CardPanel>{body}</CardPanel>
    </Card>
  );
};

const EnqueueForm = ({
  registry,
}: {
  registry: UseQueryResult<RegistryResult>;
}) => {
  const queryClient = useQueryClient();

  const enqueue = useMutation({
    // The form only knows it picked a valid option; the server validates the
    // payload against the job's own schema.
    mutationFn: (input: { name: string; payload: unknown }) =>
      orpc.admin.jobs.enqueue.call(input as never),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.jobs.recent.key(),
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.jobs.counts.key(),
      });
      toastManager.add({ title: "Job enqueued", type: "success" });
    },
  });

  const form = useForm({
    defaultValues: { name: "", payload: "{}" },
    onSubmit: async ({ formApi, value }) => {
      let payload: unknown;
      try {
        payload = JSON.parse(value.payload);
      } catch {
        toastManager.add({
          title: "Payload must be valid JSON",
          type: "error",
        });
        return;
      }
      try {
        await enqueue.mutateAsync({ name: value.name, payload });
        formApi.reset();
      } catch {
        // The mutation cache toasts the failure.
      }
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, "Choose a job"),
        payload: z.string(),
      }),
    },
  });

  const jobOptions = (registry.data ?? []).map((job) => ({
    label: job.name,
    value: job.name,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enqueue a job</CardTitle>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <CardPanel>
          <div className="space-y-4">
            <form.Field name="name">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel>Job</FieldLabel>
                  <Select
                    items={jobOptions}
                    onValueChange={(value) =>
                      field.handleChange(value as string)
                    }
                    value={field.state.value}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a job" />
                    </SelectTrigger>
                    <SelectPopup>
                      {jobOptions.map((job) => (
                        <SelectItem key={job.value} value={job.value}>
                          {job.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <FieldErrors errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>

            <form.Field name="payload">
              {(field) => (
                <Field name={field.name}>
                  <FieldLabel htmlFor={field.name}>Payload (JSON)</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    onChange={(e) => field.handleChange(e.target.value)}
                    rows={4}
                    value={field.state.value}
                  />
                </Field>
              )}
            </form.Field>
          </div>
        </CardPanel>
        <CardFooter>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                disabled={!canSubmit}
                loading={isSubmitting || enqueue.isPending}
                type="submit"
              >
                Enqueue
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </form>
    </Card>
  );
};

export const AdminJobsPage = () => {
  const registry = useQuery(orpc.admin.jobs.registry.queryOptions());
  const counts = useQuery(orpc.admin.jobs.counts.queryOptions());
  const recent = useQuery(orpc.admin.jobs.recent.queryOptions({ input: {} }));
  const schedules = useQuery(orpc.admin.jobs.schedules.queryOptions());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Jobs</h1>

      <RegistryCard counts={counts} registry={registry} />
      <SchedulesCard schedules={schedules} />
      <RecentJobsCard recent={recent} />
      <EnqueueForm registry={registry} />
    </div>
  );
};
