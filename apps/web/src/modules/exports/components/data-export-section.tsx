import { Button } from "@masdan/ui/components/button";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListItemTrailing,
  ListSection,
  ListSectionFooter,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import { useMutation } from "@tanstack/react-query";

import { householdToday } from "@/lib/household-date";
import { downloadCsv, exportFileName } from "@/modules/exports/download";
import { orpc } from "@/utils/orpc";
import type { RouterOutputs } from "@/utils/orpc";

type ExportDataset = keyof RouterOutputs["exports"];

const DATASETS: { description: string; name: ExportDataset; title: string }[] =
  [
    {
      description: "Every entry, with account, category, tags and transfers",
      name: "transactions",
      title: "Transactions",
    },
    {
      description: "Category lines of split transactions",
      name: "transactionSplits",
      title: "Transaction splits",
    },
    {
      description: "Which tags each transaction carries",
      name: "transactionTags",
      title: "Transaction tags",
    },
    {
      description: "Transfers between your accounts, both sides",
      name: "transfers",
      title: "Transfers",
    },
    {
      description: "Opening and current balances, owners and card details",
      name: "accounts",
      title: "Accounts",
    },
    {
      description: "Recorded and imported balance history",
      name: "accountBalanceSnapshots",
      title: "Balance history",
    },
    {
      description: "Statement periods, balances and due dates",
      name: "creditCardStatements",
      title: "Credit-card statements",
    },
    {
      description: "Income and expense categories",
      name: "categories",
      title: "Categories",
    },
    { description: "Transaction tags", name: "tags", title: "Tags" },
  ];

export const DataExportSection = ({
  householdName,
  timeZone,
}: {
  householdName: string;
  timeZone: string;
}) => {
  const download = useMutation({
    mutationFn: (name: ExportDataset) => orpc.exports[name].call(),
    onSuccess: ({ csv, fileName }) => {
      downloadCsv(
        exportFileName(householdName, householdToday(timeZone), fileName),
        csv
      );
    },
  });

  return (
    <ListSection aria-label="Export data">
      <ListSectionHeader>Export data</ListSectionHeader>
      <List>
        {DATASETS.map((dataset) => (
          <ListItem key={dataset.name}>
            <ListItemContent>
              <ListItemTitle>{dataset.title}</ListItemTitle>
              <ListItemDescription>{dataset.description}</ListItemDescription>
            </ListItemContent>
            <ListItemTrailing>
              <Button
                aria-label={`Download ${dataset.title} CSV`}
                disabled={download.isPending}
                loading={
                  download.isPending && download.variables === dataset.name
                }
                onClick={() => download.mutate(dataset.name)}
                size="sm"
                variant="tinted"
              >
                Download
              </Button>
            </ListItemTrailing>
          </ListItem>
        ))}
      </List>
      <ListSectionFooter>
        CSV files for this household only, archived records included.
      </ListSectionFooter>
    </ListSection>
  );
};
