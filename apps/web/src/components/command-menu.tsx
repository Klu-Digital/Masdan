import {
  Analytics01Icon,
  ArrowDataTransferHorizontalIcon,
  FileImportIcon,
  Folder02Icon,
  Home01Icon,
  Invoice02Icon,
  Moon02Icon,
  MoneyReceive01Icon,
  MoneySend01Icon,
  PlusSignIcon,
  Settings02Icon,
  Sun03Icon,
  Tag01Icon,
  UserGroupIcon,
  ViewIcon,
  ViewOffSlashIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@masdan/ui/components/command";
import { Kbd } from "@masdan/ui/components/kbd";
import { usePrivacyMode } from "@masdan/ui/lib/privacy-mode";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { useTheme } from "@/components/theme-provider";
import { useHousehold } from "@/hooks/use-household";
import type { AccountComposerRequest } from "@/modules/accounts/components/account-composer";
import { accountKind } from "@/modules/accounts/kinds";
import type { ComposerRequest } from "@/modules/transactions/components/composer";
import { householdOrpc } from "@/utils/orpc";

interface CommandEntry {
  icon: IconSvgElement;
  id: string;
  keywords?: string;
  label: string;
  handleSelect: () => void;
}

interface CommandSection {
  items: CommandEntry[];
  label: string;
}

/**
 * ⌘K: every destination and every "new" action, plus a jump to any account.
 * Filtering matches the label and a few synonyms.
 */
export const CommandMenu = ({
  compose,
  composeAccount,
  onOpenChange,
  open,
}: {
  compose: (request: ComposerRequest) => void;
  composeAccount: (request?: AccountComposerRequest) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) => {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const [privacyOn, setPrivacyOn] = usePrivacyMode();
  const { activeOrganizationId, can } = useHousehold();
  const accounts = useQuery(
    householdOrpc(activeOrganizationId).accounts.list.queryOptions({
      enabled: open && activeOrganizationId !== null,
      input: { includeArchived: true },
    })
  );

  const sections = useMemo<CommandSection[]>(() => {
    const done = (run: () => void) => () => {
      onOpenChange(false);
      run();
    };
    const go = (
      to:
        | "/dashboard"
        | "/transactions"
        | "/accounts"
        | "/reports"
        | "/categories"
        | "/tags"
        | "/settings"
        | "/settings/household"
    ) =>
      done(() => {
        navigate({ to });
      });

    const create: CommandEntry[] = can({ transaction: ["create"] })
      ? [
          {
            handleSelect: done(() =>
              compose({ kind: "expense", type: "transaction" })
            ),
            icon: MoneySend01Icon,
            id: "new-expense",
            keywords: "add spend purchase",
            label: "New expense",
          },
          {
            handleSelect: done(() =>
              compose({ kind: "income", type: "transaction" })
            ),
            icon: MoneyReceive01Icon,
            id: "new-income",
            keywords: "add salary earn",
            label: "New income",
          },
          {
            handleSelect: done(() => compose({ type: "transfer" })),
            icon: ArrowDataTransferHorizontalIcon,
            id: "new-transfer",
            keywords: "move pay card",
            label: "New transfer",
          },
          {
            handleSelect: done(() => {
              navigate({ to: "/imports" });
            }),
            icon: FileImportIcon,
            id: "import-csv",
            keywords: "csv upload bank statement history backfill",
            label: "Import transactions",
          },
        ]
      : [];
    if (can({ financialAccount: ["create"] })) {
      create.push({
        handleSelect: done(() => composeAccount()),
        icon: PlusSignIcon,
        id: "new-account",
        keywords: "add bank wallet card",
        label: "New account",
      });
    }

    const result: CommandSection[] = [];
    if (create.length > 0) {
      result.push({ items: create, label: "Create" });
    }
    result.push({
      items: [
        {
          handleSelect: go("/dashboard"),
          icon: Home01Icon,
          id: "go-overview",
          keywords: "home dashboard summary",
          label: "Overview",
        },
        {
          handleSelect: go("/transactions"),
          icon: Invoice02Icon,
          id: "go-transactions",
          keywords: "ledger activity",
          label: "Transactions",
        },
        {
          handleSelect: go("/accounts"),
          icon: Wallet01Icon,
          id: "go-accounts",
          keywords: "balances net worth",
          label: "Accounts",
        },
        {
          handleSelect: go("/reports"),
          icon: Analytics01Icon,
          id: "go-reports",
          keywords: "net worth cash flow spending income expenses history",
          label: "Reports",
        },
        {
          handleSelect: go("/categories"),
          icon: Folder02Icon,
          id: "go-categories",
          label: "Categories",
        },
        {
          handleSelect: go("/tags"),
          icon: Tag01Icon,
          id: "go-tags",
          label: "Tags",
        },
        {
          handleSelect: go("/settings/household"),
          icon: UserGroupIcon,
          id: "go-household",
          keywords: "members invite currency",
          label: "Household settings",
        },
        {
          handleSelect: go("/settings"),
          icon: Settings02Icon,
          id: "go-settings",
          keywords: "profile name email",
          label: "Profile",
        },
      ],
      label: "Go to",
    });
    const accountItems = (accounts.data ?? [])
      .filter((account) => account.archivedAt === null)
      .map((account) => ({
        handleSelect: done(() => {
          navigate({
            params: { accountId: account.id },
            to: "/accounts/$accountId",
          });
        }),
        icon: accountKind(account.accountType).icon,
        id: `account-${account.id}`,
        keywords: `${account.institution ?? ""} ${accountKind(account.accountType).label}`,
        label: account.name,
      }));
    if (accountItems.length > 0) {
      result.push({ items: accountItems, label: "Accounts" });
    }
    result.push({
      items: [
        {
          handleSelect: done(() => setTheme("light")),
          icon: Sun03Icon,
          id: "theme-light",
          keywords: "appearance",
          label: "Use light appearance",
        },
        {
          handleSelect: done(() => setTheme("dark")),
          icon: Moon02Icon,
          id: "theme-dark",
          keywords: "appearance",
          label: "Use dark appearance",
        },
        {
          handleSelect: done(() => setTheme("system")),
          icon: Settings02Icon,
          id: "theme-system",
          keywords: "appearance auto",
          label: "Match system appearance",
        },
        {
          handleSelect: done(() => setPrivacyOn(!privacyOn)),
          icon: privacyOn ? ViewOffSlashIcon : ViewIcon,
          id: "privacy-mode",
          keywords: "privacy mode mask blur",
          label: privacyOn ? "Show amounts" : "Hide amounts",
        },
      ],
      label: "Appearance",
    });
    return result;
  }, [
    accounts.data,
    can,
    compose,
    composeAccount,
    navigate,
    onOpenChange,
    privacyOn,
    setPrivacyOn,
    setTheme,
  ]);

  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <CommandDialogPopup aria-label="Command menu">
        <Command
          itemToStringValue={(item) => {
            const entry = item as CommandEntry;
            return `${entry.label} ${entry.keywords ?? ""}`;
          }}
          items={sections}
        >
          <CommandInput placeholder="Search or jump to…" />
          <CommandPanel>
            <CommandEmpty>Nothing matches that.</CommandEmpty>
            <CommandList>
              {(section: CommandSection) => (
                <CommandGroup items={section.items} key={section.label}>
                  <CommandGroupLabel>{section.label}</CommandGroupLabel>
                  <CommandCollection>
                    {(item: CommandEntry) => (
                      <CommandItem
                        key={item.id}
                        onClick={item.handleSelect}
                        value={item}
                      >
                        <span className="flex items-center gap-2.5">
                          <HugeiconsIcon
                            className="text-muted-foreground size-4"
                            icon={item.icon}
                            strokeWidth={1.8}
                          />
                          {item.label}
                        </span>
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to move, <Kbd>↵</Kbd> to choose
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>N</Kbd> new expense
            </span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
};
