import type { RouterOutputs } from "@/utils/orpc";

export type TransactionAttachment =
  RouterOutputs["attachments"]["list"][number];

const KIB = 1024;
const MIB = KIB * KIB;

export const formatFileSize = (bytes: number | null): string => {
  if (bytes === null) {
    return "";
  }
  if (bytes >= MIB) {
    return `${(bytes / MIB).toFixed(1)} MB`;
  }
  if (bytes >= KIB) {
    return `${(bytes / KIB).toFixed(1)} KB`;
  }
  return `${bytes} B`;
};
