import { orgProcedure, requirePermission } from "../procedures";
import type { ExportDataset, ExportDatasetName } from "./datasets";
import { EXPORT_DATASETS } from "./datasets";

const csvExport = (name: ExportDatasetName, dataset: ExportDataset) =>
  orgProcedure
    .use(requirePermission(dataset.permissions))
    .handler(async ({ context }) => {
      const { csv, rowCount } = await dataset.build(
        context.db,
        context.organizationId
      );
      context.log?.info("exports.csv.generated", {
        action: "exports.csv.generated",
        actorId: context.session.user.id,
        dataset: name,
        organizationId: context.organizationId,
        rowCount,
      });
      return { csv, fileName: dataset.fileName, rowCount };
    });

/** Read-only CSV downloads of the active household's canonical records. */
export const exportsRouter = {
  accountBalanceSnapshots: csvExport(
    "accountBalanceSnapshots",
    EXPORT_DATASETS.accountBalanceSnapshots
  ),
  accounts: csvExport("accounts", EXPORT_DATASETS.accounts),
  categories: csvExport("categories", EXPORT_DATASETS.categories),
  creditCardStatements: csvExport(
    "creditCardStatements",
    EXPORT_DATASETS.creditCardStatements
  ),
  tags: csvExport("tags", EXPORT_DATASETS.tags),
  transactionSplits: csvExport(
    "transactionSplits",
    EXPORT_DATASETS.transactionSplits
  ),
  transactionTags: csvExport(
    "transactionTags",
    EXPORT_DATASETS.transactionTags
  ),
  transactions: csvExport("transactions", EXPORT_DATASETS.transactions),
  transfers: csvExport("transfers", EXPORT_DATASETS.transfers),
};
