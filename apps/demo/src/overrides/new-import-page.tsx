import { FileUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Page } from "@masdan/ui/components/page";
import { Link } from "@tanstack/react-router";

export const NewImportPage = (_props: {
  accountId?: string;
  activeOrganizationId: string;
}) => (
  <Page width="narrow">
    <Empty>
      <EmptyMedia>
        <HugeiconsIcon icon={FileUploadIcon} strokeWidth={1.8} />
      </EmptyMedia>
      <EmptyTitle>Imports are off in the demo</EmptyTitle>
      <EmptyDescription>
        CSV imports upload to storage and run on the Masdan server. Add a
        transaction by hand to see how the ledger responds.
      </EmptyDescription>
      <EmptyContent>
        <Button render={<Link to="/transactions" />}>Go to transactions</Button>
      </EmptyContent>
    </Empty>
  </Page>
);
