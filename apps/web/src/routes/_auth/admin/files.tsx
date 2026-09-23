import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "@masdan/ui/components/tabs";
import { toastManager } from "@masdan/ui/components/toast";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { client, orpc } from "@/utils/orpc";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Ready", value: "ready" },
  { label: "Failed", value: "failed" },
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

type FilesResult = Awaited<ReturnType<typeof client.admin.files.list>>;
type StuckFilesResult = Awaited<
  ReturnType<typeof client.admin.files.pendingOlderThan>
>;

const formatBytes = (bytes: number | null) => {
  if (bytes === null) {
    return "—";
  }
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1
    ? `${megabytes.toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
};

const fileStatusBadgeVariant = (status: string) => {
  if (status === "ready") {
    return "default" as const;
  }
  if (status === "failed") {
    return "error" as const;
  }
  return "outline" as const;
};

const FilesList = ({
  download,
  files,
  offset,
  remove,
  setOffset,
}: {
  download: UseMutationResult<{ downloadUrl: string }, Error, string>;
  files: UseQueryResult<FilesResult>;
  offset: number;
  remove: UseMutationResult<{ fileId: string }, Error, string>;
  setOffset: (offset: number) => void;
}) => {
  if (files.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!files.data || files.data.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No files</EmptyTitle>
        <EmptyDescription>Nothing matches this filter.</EmptyDescription>
      </Empty>
    );
  }

  const rows = files.data;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Organization</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Size</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((file) => (
            <TableRow key={file.id}>
              <TableCell>
                <span className="block max-w-64 truncate">{file.name}</span>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground text-xs">
                  {file.organizationName}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground text-xs">
                  {file.userEmail}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant={fileStatusBadgeVariant(file.status)}>
                  {file.status}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-xs">{formatBytes(file.size)}</span>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    disabled={file.status !== "ready"}
                    loading={
                      download.isPending && download.variables === file.id
                    }
                    onClick={() => download.mutate(file.id)}
                    size="sm"
                    variant="outline"
                  >
                    Download
                  </Button>
                  <Button
                    loading={remove.isPending && remove.variables === file.id}
                    onClick={() => remove.mutate(file.id)}
                    size="sm"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <Button
          disabled={rows.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
          size="sm"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </>
  );
};

const FilesTable = () => {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("all");
  const queryClient = useQueryClient();

  const files = useQuery(
    orpc.admin.files.list.queryOptions({
      input: {
        limit: PAGE_SIZE,
        offset,
        ...(status === "all" ? {} : { status }),
      },
    })
  );

  const download = useMutation({
    mutationFn: (fileId: string) => client.admin.files.downloadUrl({ fileId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: (data) => {
      window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    },
  });

  const remove = useMutation({
    mutationFn: (fileId: string) => client.admin.files.deleteFile({ fileId }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.files.list.key(),
      });
      toastManager.add({ title: "File deleted", type: "success" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-end">
          <Select
            items={STATUS_OPTIONS}
            onValueChange={(value) => {
              setStatus(value as StatusFilter);
              setOffset(0);
            }}
            value={status}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      </CardHeader>
      <CardPanel>
        <FilesList
          download={download}
          files={files}
          offset={offset}
          remove={remove}
          setOffset={setOffset}
        />
      </CardPanel>
    </Card>
  );
};

const StuckPendingList = ({
  stuck,
}: {
  stuck: UseQueryResult<StuckFilesResult>;
}) => {
  if (stuck.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!stuck.data || stuck.data.length === 0) {
    return (
      <Empty>
        <EmptyTitle>None stuck</EmptyTitle>
        <EmptyDescription>
          Every pending upload is under 24 hours old.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Organization</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stuck.data.map((file) => (
          <TableRow key={file.id}>
            <TableCell>{file.name}</TableCell>
            <TableCell>
              <span className="text-muted-foreground text-xs">
                {file.organizationName}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-muted-foreground text-xs">
                {file.userEmail}
              </span>
            </TableCell>
            <TableCell>
              <span className="text-xs">
                {new Date(file.createdAt).toLocaleString()}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

const StuckPendingTable = () => {
  const stuck = useQuery(
    orpc.admin.files.pendingOlderThan.queryOptions({ input: { hours: 24 } })
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stuck pending</CardTitle>
        <CardDescription>Pending for over 24 hours.</CardDescription>
      </CardHeader>
      <CardPanel>
        <StuckPendingList stuck={stuck} />
      </CardPanel>
    </Card>
  );
};

const RouteComponent = () => (
  <div className="space-y-6">
    <h1 className="text-2xl font-bold">Files</h1>

    <Tabs defaultValue="all">
      <TabsList>
        <TabsTab value="all">All files</TabsTab>
        <TabsTab value="stuck">Stuck pending</TabsTab>
      </TabsList>
      <TabsPanel value="all">
        <FilesTable />
      </TabsPanel>
      <TabsPanel value="stuck">
        <StuckPendingTable />
      </TabsPanel>
    </Tabs>
  </div>
);

export const Route = createFileRoute("/_auth/admin/files")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Files" }] }),
});
