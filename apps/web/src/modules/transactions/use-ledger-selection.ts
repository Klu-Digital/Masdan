import { useState } from "react";

import type { TransactionSearch } from "./search";

export const useLedgerSelection = (search: TransactionSearch) => {
  const selectionKey = JSON.stringify(search);
  const [selection, setSelection] = useState<{ ids: Set<string>; key: string }>(
    () => ({ ids: new Set(), key: selectionKey })
  );
  if (selection.key !== selectionKey) {
    setSelection({ ids: new Set(), key: selectionKey });
  }
  const selectedIds =
    selection.key === selectionKey ? selection.ids : new Set<string>();
  const clearSelection = () =>
    setSelection({ ids: new Set(), key: selectionKey });
  const toggleSelection = (id: string) =>
    setSelection((current) => {
      const next = new Set(current.key === selectionKey ? current.ids : []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ids: next, key: selectionKey };
    });
  const toggleAll = (ids: string[]) =>
    setSelection((current) => {
      const next = new Set(current.key === selectionKey ? current.ids : []);
      if (ids.every((id) => next.has(id))) {
        for (const id of ids) {
          next.delete(id);
        }
      } else {
        for (const id of ids) {
          next.add(id);
        }
      }
      return { ids: next, key: selectionKey };
    });
  return { clearSelection, selectedIds, toggleAll, toggleSelection };
};
