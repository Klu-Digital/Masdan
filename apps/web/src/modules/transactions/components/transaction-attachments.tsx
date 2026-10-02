import {
  Add01Icon,
  Attachment01Icon,
  Cancel01Icon,
  Delete02Icon,
  Download04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { allowedContentTypes } from "@masdan/storage/content-types";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@masdan/ui/components/alert-dialog";
import { Button } from "@masdan/ui/components/button";
import { ImageZoom } from "@masdan/ui/components/image-zoom";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
  ListSection,
  ListSectionFooter,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { Spinner } from "@masdan/ui/components/spinner";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { useHousehold } from "@/hooks/use-household";
import { uploadFile } from "@/lib/upload";
import type { UploadFileOptions, UploadState } from "@/lib/upload";
import { client } from "@/utils/client";
import { errorMessage, householdOrpc } from "@/utils/orpc";

import { formatFileSize } from "../attachments";
import type { TransactionAttachment } from "../attachments";

/** A hint for the picker only; `files.createUpload` is what enforces it. */
const ACCEPT = allowedContentTypes.join(",");

/** Below the presigned URL's 15-minute expiry, so a cached thumbnail never 403s. */
const PREVIEW_STALE_MS = 10 * 60 * 1000;

const isPreviewable = (attachment: TransactionAttachment): boolean =>
  attachment.status === "ready" && attachment.contentType.startsWith("image/");

const AttachmentThumbnail = ({
  attachment,
}: {
  attachment: TransactionAttachment;
}) => {
  const { activeOrganizationId } = useHousehold();
  const preview = useQuery(
    householdOrpc(activeOrganizationId).attachments.downloadUrl.queryOptions({
      input: { fileId: attachment.id, transactionId: attachment.transactionId },
      meta: { suppressErrorToast: true },
      staleTime: PREVIEW_STALE_MS,
    })
  );
  if (preview.isPending) {
    return <Skeleton className="size-10" radius="lg" />;
  }
  if (preview.isError) {
    return <HugeiconsIcon icon={Attachment01Icon} strokeWidth={1.8} />;
  }
  return (
    <ImageZoom zoomMargin={24}>
      <img
        alt={attachment.name}
        className="bg-secondary size-10 rounded-lg object-cover"
        decoding="async"
        loading="lazy"
        src={preview.data.downloadUrl}
      />
    </ImageZoom>
  );
};

interface PendingUpload {
  error: string | null;
  id: number;
  name: string;
  progress: number;
  state: UploadState;
}

/** Upload through the files router, then link. */
const uploadAndAttach = async (
  selected: File,
  transactionId: string,
  options: UploadFileOptions
): Promise<void> => {
  const uploaded = await uploadFile(selected, options);
  if (!uploaded) {
    throw new Error("The upload couldn’t be confirmed");
  }
  try {
    await client.attachments.attach({ fileId: uploaded.id, transactionId });
  } catch (error) {
    // Uploaded but never linked: delete it rather than leave a stray household file.
    await client.files.deleteFile({ fileId: uploaded.id }).catch(() => null);
    throw error;
  }
};

const uploadLabel = (upload: PendingUpload): string => {
  if (upload.state === "processing") {
    return "Checking upload…";
  }
  if (upload.state === "done") {
    return "Attaching…";
  }
  return `Uploading… ${Math.round(upload.progress * 100)}%`;
};

const PendingRow = ({
  onDismiss,
  upload,
}: {
  onDismiss: () => void;
  upload: PendingUpload;
}) => (
  <ListItem className="min-h-12">
    <ListItemLeading>
      {upload.error ? (
        <HugeiconsIcon
          className="text-destructive-foreground"
          icon={Attachment01Icon}
          strokeWidth={1.8}
        />
      ) : (
        <Spinner />
      )}
    </ListItemLeading>
    <ListItemContent>
      <ListItemTitle>{upload.name}</ListItemTitle>
      {upload.error ? (
        <p className="text-destructive-foreground text-xs" role="alert">
          {upload.error}
        </p>
      ) : (
        <ListItemDescription>{uploadLabel(upload)}</ListItemDescription>
      )}
    </ListItemContent>
    {upload.error ? (
      <ListItemTrailing>
        <Button
          aria-label={`Dismiss ${upload.name}`}
          onClick={onDismiss}
          size="icon-sm"
          variant="ghost"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </ListItemTrailing>
    ) : null}
  </ListItem>
);

// oxlint-disable-next-line complexity
export const TransactionAttachments = ({
  editable,
  transactionId,
}: {
  editable: boolean;
  transactionId: string;
}) => {
  const { activeOrganizationId, can, session } = useHousehold();
  const queryClient = useQueryClient();
  const orpc = householdOrpc(activeOrganizationId);
  const attachments = useQuery(
    orpc.attachments.list.queryOptions({
      input: { transactionId },
      // The section renders its own failure state.
      meta: { suppressErrorToast: true },
    })
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const nextUploadId = useRef(0);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [removing, setRemoving] = useState<TransactionAttachment | null>(null);

  const canAttach =
    editable && can({ attachment: ["create"], transaction: ["update"] });
  const canDelete =
    editable && can({ attachment: ["delete"], transaction: ["update"] });
  const canDeleteAny = can({ attachment: ["delete:any"] });
  const canRemove = (attachment: TransactionAttachment) =>
    canDelete && (attachment.userId === session.user.id || canDeleteAny);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.attachments.list.key({ input: { transactionId } }),
    });

  const patchUpload = (id: number, patch: Partial<PendingUpload>) =>
    setUploads((current) =>
      current.map((upload) =>
        upload.id === id ? { ...upload, ...patch } : upload
      )
    );

  const attachOne = async (selected: File, id: number) => {
    try {
      await uploadAndAttach(selected, transactionId, {
        onProgress: (progress) => patchUpload(id, { progress }),
        onStateChange: (state) => patchUpload(id, { state }),
      });
      await refresh();
      setUploads((current) => current.filter((upload) => upload.id !== id));
    } catch (error) {
      patchUpload(id, {
        error: errorMessage(error),
        state: "error",
      });
    }
  };

  const addFiles = async (selected: File[]) => {
    const batch = selected.map((file) => {
      nextUploadId.current += 1;
      return { file, id: nextUploadId.current };
    });
    setUploads((current) => [
      ...current,
      ...batch.map(({ file, id }) => ({
        error: null,
        id,
        name: file.name,
        progress: 0,
        state: "idle" as const,
      })),
    ]);
    for (const { file, id } of batch) {
      await attachOne(file, id);
    }
  };

  const download = useMutation(
    orpc.attachments.downloadUrl.mutationOptions({
      onSuccess: ({ downloadUrl }) => {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      },
    })
  );

  const remove = useMutation(
    orpc.attachments.remove.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setRemoving(null);
        toastManager.add({ title: "Attachment removed", type: "success" });
      },
    })
  );

  if (attachments.isPending) {
    return (
      <ListSection aria-busy="true" aria-label="Attachments">
        <ListSectionHeader>Attachments</ListSectionHeader>
        <Skeleton className="h-12 w-full" radius="2xl" />
      </ListSection>
    );
  }

  if (attachments.isError) {
    return (
      <ListSection aria-label="Attachments">
        <ListSectionHeader>Attachments</ListSectionHeader>
        <div className="bg-card dark:ring-hairline flex items-center justify-between gap-3 rounded-2xl px-4 py-3 dark:ring-1">
          <p className="text-muted-foreground text-sm" role="alert">
            Couldn’t load attachments.
          </p>
          <Button
            onClick={() => attachments.refetch()}
            size="sm"
            variant="secondary"
          >
            Try again
          </Button>
        </div>
      </ListSection>
    );
  }

  const items = attachments.data;
  if (items.length === 0 && uploads.length === 0 && !canAttach) {
    return null;
  }

  return (
    <ListSection aria-label="Attachments">
      <ListSectionHeader>
        Attachments
        {canAttach ? (
          <Button
            onClick={() => inputRef.current?.click()}
            size="xs"
            variant="ghost"
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Add
          </Button>
        ) : null}
      </ListSectionHeader>
      {canAttach ? (
        <input
          accept={ACCEPT}
          aria-label="Add attachments"
          className="sr-only"
          multiple
          onChange={(event) => {
            const selected = [...(event.target.files ?? [])];
            // Cleared so choosing the same file again still fires `change`.
            event.target.value = "";
            if (selected.length > 0) {
              void addFiles(selected);
            }
          }}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
      ) : null}
      {items.length > 0 || uploads.length > 0 ? (
        <List>
          {items.map((attachment) => (
            <ListItem className="min-h-12" key={attachment.id}>
              <ListItemLeading>
                {isPreviewable(attachment) ? (
                  <AttachmentThumbnail attachment={attachment} />
                ) : (
                  <HugeiconsIcon icon={Attachment01Icon} strokeWidth={1.8} />
                )}
              </ListItemLeading>
              <ListItemContent>
                <ListItemTitle>{attachment.name}</ListItemTitle>
                <ListItemDescription>
                  {attachment.status === "ready"
                    ? formatFileSize(attachment.size)
                    : "Unavailable"}
                </ListItemDescription>
              </ListItemContent>
              <ListItemTrailing>
                <Button
                  aria-label={`Download ${attachment.name}`}
                  disabled={attachment.status !== "ready"}
                  loading={
                    download.isPending &&
                    download.variables.fileId === attachment.id
                  }
                  onClick={() =>
                    download.mutate({ fileId: attachment.id, transactionId })
                  }
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon icon={Download04Icon} strokeWidth={1.8} />
                </Button>
                {canRemove(attachment) ? (
                  <Button
                    aria-label={`Remove ${attachment.name}`}
                    onClick={() => setRemoving(attachment)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
                  </Button>
                ) : null}
              </ListItemTrailing>
            </ListItem>
          ))}
          {uploads.map((upload) => (
            <PendingRow
              key={upload.id}
              onDismiss={() =>
                setUploads((current) =>
                  current.filter(({ id }) => id !== upload.id)
                )
              }
              upload={upload}
            />
          ))}
        </List>
      ) : (
        <ListSectionFooter>
          Add receipts or other documents for this entry.
        </ListSectionFooter>
      )}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
          }
        }}
        open={removing !== null}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is deleted from storage, not just unlinked. This can’t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="secondary" />}>
              Cancel
            </AlertDialogClose>
            <Button
              loading={remove.isPending}
              onClick={() => {
                if (removing) {
                  remove.mutate({ fileId: removing.id, transactionId });
                }
              }}
              variant="destructive"
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </ListSection>
  );
};
