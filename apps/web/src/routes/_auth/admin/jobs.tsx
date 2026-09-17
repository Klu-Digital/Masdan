import { Badge } from "@k22i/ui/components/badge";
import { Button } from "@k22i/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@k22i/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@k22i/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@k22i/ui/components/field";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@k22i/ui/components/select";
import { Skeleton } from "@k22i/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@k22i/ui/components/table";
import { Textarea } from "@k22i/ui/components/textarea";
import { toastManager } from "@k22i/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import type { UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type React from "react";
import { z } from "zod";

import { client, orpc } from "@/utils/orpc";

type RegistryResult = Awaited<ReturnType<typeof client.admin.jobs.registry>>;
type CountsResult = Awaited<ReturnType<typeof client.admin.jobs.counts>>;
type RecentResult = Awaited<ReturnType<typeof client.admin.jobs.recent>>;
type SchedulesResult = Awaited<ReturnType<typeof client.admin.jobs.schedules>>;

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
                <span className="text-xs">
                  {new Date(job.createdOn).toLocaleString()}
                </span>
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
      client.admin.jobs.enqueue(input as never),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
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
        // Surfaced to the user via the mutation's own `onError` toast.
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
                  {field.state.meta.errors.map((error) => (
                    <FieldError key={error?.message} match>
                      {error?.message}
                    </FieldError>
                  ))}
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

const RouteComponent = () => {
  const registry = useQuery(orpc.admin.jobs.registry.queryOptions());
  const counts = useQuery(orpc.admin.jobs.counts.queryOptions());
  const recent = useQuery(orpc.admin.jobs.recent.queryOptions({ input: {} }));
  const schedules = useQuery(orpc.admin.jobs.schedules.queryOptions());

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Jobs</h1>

      <RegistryCard counts={counts} registry={registry} />
      <SchedulesCard schedules={schedules} />
      <RecentJobsCard recent={recent} />
      <EnqueueForm registry={registry} />
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/jobs")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Jobs" }] }),
});
