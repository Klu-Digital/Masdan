import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { CommandMenu } from "@/components/command-menu";
import { useHousehold } from "@/hooks/use-household";
import { AccountComposer } from "@/modules/accounts/components/account-composer";
import type { AccountComposerRequest } from "@/modules/accounts/components/account-composer";
import { Composer } from "@/modules/transactions/components/composer";
import type { ComposerRequest } from "@/modules/transactions/components/composer";
import { TransactionInspector } from "@/modules/transactions/components/inspector";
import { useLedgerActions } from "@/modules/transactions/use-ledger-actions";

interface AppActions {
  /** Open the ledger composer (new or edit). */
  compose: (request: ComposerRequest) => void;
  /** Open the account composer (new or edit). */
  composeAccount: (request?: AccountComposerRequest) => void;
  /** Show a transaction's detail over the current page. */
  inspect: (transactionId: string) => void;
  openCommandMenu: () => void;
}

const AppActionsContext = createContext<AppActions | null>(null);

export const useAppActions = (): AppActions => {
  const context = useContext(AppActionsContext);
  if (!context) {
    throw new Error("useAppActions must be used inside <AppActionsProvider>");
  }
  return context;
};

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

/**
 * Hosts the app's modal surfaces once, above every page, so "New expense",
 * "Pay card" or a transaction's detail open the same way from anywhere. Each
 * surface is keyed per opening: its form state starts fresh every time.
 */
export const AppActionsProvider = ({ children }: { children: ReactNode }) => {
  const household = useHousehold();
  const navigate = useNavigate();
  const { activeOrganizationId, can } = household;
  const ledgerActions = useLedgerActions(activeOrganizationId);

  const [composer, setComposer] = useState<{
    key: number;
    open: boolean;
    request: ComposerRequest;
  } | null>(null);
  const [accountComposer, setAccountComposer] = useState<{
    key: number;
    open: boolean;
    request: AccountComposerRequest;
  } | null>(null);
  const [inspector, setInspector] = useState<{
    id: string;
    open: boolean;
  } | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  const canCreate = can({ transaction: ["create"] });

  const compose = useCallback((request: ComposerRequest) => {
    setComposer({ key: Date.now(), open: true, request });
  }, []);
  const composeAccount = useCallback((request: AccountComposerRequest = {}) => {
    setAccountComposer({ key: Date.now(), open: true, request });
  }, []);
  const inspect = useCallback((transactionId: string) => {
    setInspector({ id: transactionId, open: true });
  }, []);
  const openCommandMenu = useCallback(() => setCommandOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (
        event.key === "n" &&
        !(event.metaKey || event.ctrlKey || event.altKey) &&
        !isTyping(event.target) &&
        canCreate &&
        activeOrganizationId
      ) {
        event.preventDefault();
        compose({ kind: "expense", type: "transaction" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeOrganizationId, canCreate, compose]);

  const value = useMemo(
    () => ({ compose, composeAccount, inspect, openCommandMenu }),
    [compose, composeAccount, inspect, openCommandMenu]
  );

  const permissions = {
    canArchive: can({ transaction: ["archive"] }),
    canRestore: can({ transaction: ["restore"] }),
    canUpdate: can({ transaction: ["update"] }),
  };

  return (
    <AppActionsContext.Provider value={value}>
      {children}
      {activeOrganizationId && composer ? (
        <Composer
          activeOrganizationId={activeOrganizationId}
          householdCurrency={household.currency ?? "PHP"}
          key={composer.key}
          onOpenChange={(open) =>
            setComposer((current) => (current ? { ...current, open } : current))
          }
          open={composer.open}
          request={composer.request}
          timezone={household.timezone}
        />
      ) : null}
      {activeOrganizationId && accountComposer ? (
        <AccountComposer
          activeOrganizationId={activeOrganizationId}
          defaults={{
            currency: household.currency,
            members: household.members,
            timezone: household.timezone,
          }}
          onOpenAccount={(accountId) =>
            navigate({ params: { accountId }, to: "/accounts/$accountId" })
          }
          key={accountComposer.key}
          onOpenChange={(open) =>
            setAccountComposer((current) =>
              current ? { ...current, open } : current
            )
          }
          open={accountComposer.open}
          request={accountComposer.request}
        />
      ) : null}
      {inspector ? (
        <TransactionInspector
          actions={ledgerActions}
          onEdit={(detail) => {
            setInspector((current) =>
              current ? { ...current, open: false } : current
            );
            compose(
              detail.transfer
                ? { transfer: detail.transfer, type: "transfer" }
                : { transaction: detail, type: "transaction" }
            );
          }}
          onOpenChange={(open) =>
            setInspector((current) =>
              current ? { ...current, open } : current
            )
          }
          open={inspector.open}
          permissions={permissions}
          transactionId={inspector.id}
        />
      ) : null}
      <CommandMenu
        compose={compose}
        composeAccount={composeAccount}
        onOpenChange={setCommandOpen}
        open={commandOpen}
      />
    </AppActionsContext.Provider>
  );
};
