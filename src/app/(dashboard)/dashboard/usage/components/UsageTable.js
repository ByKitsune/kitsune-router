"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import UsageCost from "@/shared/components/UsageCost";
import { fmt, fmtCompact, fmtCost, fmtTime } from "@/shared/utils/format";

function SortIcon({ field, currentSort, currentOrder }) {
  if (currentSort !== field) return <span className="ml-1 opacity-20">↕</span>;
  return <span className="ml-1">{currentOrder === "asc" ? "↑" : "↓"}</span>;
}

SortIcon.propTypes = {
  field: PropTypes.string.isRequired,
  currentSort: PropTypes.string.isRequired,
  currentOrder: PropTypes.string.isRequired,
};

/**
 * Render 3 token or cost cells based on viewMode
 */
function ValueCells({ item, viewMode, isSummary = false }) {
  if (viewMode === "tokens") {
    return (
      <>
        <td className="px-6 py-3 text-right text-text-muted">
          {isSummary && item.promptTokens === undefined ? "—" : fmt(item.promptTokens)}
        </td>
        <td className="px-6 py-3 text-right text-text-muted">
          {item.cachedTokens ? fmt(item.cachedTokens) : "—"}
        </td>
        <td className="px-6 py-3 text-right text-text-muted">
          {isSummary && item.completionTokens === undefined ? "—" : fmt(item.completionTokens)}
        </td>
        <td className="px-6 py-3 text-right font-medium">
          {fmt(item.totalTokens)}
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-6 py-3 text-right text-text-muted">
        {isSummary && item.inputCost === undefined ? "—" : <UsageCost value={item.inputCost} coverage={item.costCoverage?.inputCost} />}
      </td>
      <td className="px-6 py-3 text-right text-text-muted">
        {item.cachedCost === undefined ? "—" : <UsageCost value={item.cachedCost} coverage={item.costCoverage?.cachedCost} />}
      </td>
      <td className="px-6 py-3 text-right text-text-muted">
        {isSummary && item.outputCost === undefined ? "—" : <UsageCost value={item.outputCost} coverage={item.costCoverage?.outputCost} />}
      </td>
      <td className="px-6 py-3 text-right font-medium text-warning">
        <UsageCost value={item.totalCost !== undefined ? item.totalCost : item.cost} coverage={item.costCoverage?.totalCost} />
      </td>
    </>
  );
}

ValueCells.propTypes = {
  item: PropTypes.object.isRequired,
  viewMode: PropTypes.string.isRequired,
  isSummary: PropTypes.bool,
};

/**
 * Reusable sortable usage table with expandable group rows.
 *
 * @param {object} props
 * @param {string} props.title - Table title
 * @param {Array} props.columns - Column definitions [{field, label}]
 * @param {Array} props.groupedData - Grouped data from groupDataByKey
 * @param {string} props.tableType - Table type key for sort URL params
 * @param {string} props.sortBy - Current sort field
 * @param {string} props.sortOrder - Current sort order
 * @param {function} props.onToggleSort - Sort toggle handler
 * @param {string} props.viewMode - "tokens" or "costs"
 * @param {string} props.storageKey - localStorage key for expanded state
 * @param {function} props.renderGroupLabel - Render group summary first cell content
 * @param {function} props.renderDetailCells - Render detail row custom cells (before value cells)
 * @param {function} props.renderSummaryCells - Render summary row cells after group label (placeholder cols)
 * @param {string} props.emptyMessage - Empty state message
 */
export default function UsageTable({
  title,
  columns,
  groupedData,
  tableType,
  sortBy,
  sortOrder,
  onToggleSort,
  viewMode,
  storageKey,
  renderDetailCells,
  renderSummaryCells,
  emptyMessage,
}) {
  const [expanded, setExpanded] = useState(new Set());

  // Load expanded state from localStorage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (!cancelled && saved) setExpanded(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error(`Failed to load ${storageKey}:`, e);
      }
    })();
    return () => { cancelled = true; };
  }, [storageKey]);

  // Save expanded state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch (e) {
      console.error(`Failed to save ${storageKey}:`, e);
    }
  }, [expanded, storageKey]);

  const toggleGroup = useCallback((groupKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
  }, []);

  const valueColumns = useMemo(() => {
    if (viewMode === "tokens") {
      return [
        { field: "promptTokens", label: "Input Tokens" },
        { field: "cachedTokens", label: "Cached" },
        { field: "completionTokens", label: "Output Tokens" },
        { field: "totalTokens", label: "Total Tokens" },
      ];
    }
    return [
      { field: "inputCost", label: "Input Cost" },
      { field: "cachedCost", label: "Cached Cost" },
      { field: "outputCost", label: "Output Cost" },
      { field: "cost", label: "Total Cost" },
    ];
  }, [viewMode]);

  const totalColSpan = columns.length + valueColumns.length;

  return (
    <Card padding="none" className="min-w-0 overflow-hidden">
      {title && <div className="border-b border-border-subtle p-5 sm:px-6">
        <h3 className="font-semibold tracking-tight">{title}</h3>
      </div>}
      <div className="overflow-x-auto overscroll-x-contain" role="region" aria-label={title || "Usage breakdown table"} tabIndex={0}>
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-surface-2/60 text-[10px] font-medium uppercase tracking-wider text-text-subtle">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.field}
                  scope="col"
                  aria-sort={sortBy === col.field ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                  className={`px-6 py-2 ${col.align === "right" ? "text-right" : ""}`}
                >
                  <button type="button" onClick={() => onToggleSort(tableType, col.field)} className="min-h-10 whitespace-nowrap text-left hover:text-primary">
                    {col.label}{" "}<SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
                  </button>
                </th>
              ))}
              {valueColumns.map((col) => (
                <th
                  key={col.field}
                  scope="col"
                  aria-sort={sortBy === col.field ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                  className="px-6 py-2 text-right"
                >
                  <button type="button" onClick={() => onToggleSort(tableType, col.field)} className="min-h-10 whitespace-nowrap hover:text-primary">
                    {col.label}{" "}<SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {groupedData.map((group) => (
              <Fragment key={group.groupKey}>
                {/* Group summary row */}
                <tr
                  className="group-summary cursor-pointer transition-colors hover:bg-surface-2/60"
                  onClick={() => toggleGroup(group.groupKey)}
                >
                  <td className="px-6 py-3">
                    <button type="button" aria-expanded={expanded.has(group.groupKey)} onClick={(event) => { event.stopPropagation(); toggleGroup(group.groupKey); }} className="flex min-h-9 max-w-xs items-center gap-2 text-left">
                      <span aria-hidden="true" className={`material-symbols-outlined shrink-0 text-[18px] text-text-muted transition-transform duration-300 ${expanded.has(group.groupKey) ? "rotate-90" : ""}`}>
                        chevron_right
                      </span>
                      <span className={`truncate font-semibold transition-colors ${group.summary.pending > 0 ? "text-primary" : ""}`}>
                        {group.groupKey}
                      </span>
                    </button>
                  </td>
                  {renderSummaryCells(group)}
                  <ValueCells item={group.summary} viewMode={viewMode} isSummary />
                </tr>
                {/* Detail rows */}
                {expanded.has(group.groupKey) && group.items.map((item) => (
                  <tr
                    key={`detail-${item.key}`}
                    className="group-detail usage-request-row bg-surface-2/20 transition-colors hover:bg-surface-2/50"
                  >
                    {renderDetailCells(item)}
                    <ValueCells item={item} viewMode={viewMode} />
                  </tr>
                ))}
              </Fragment>
            ))}
            {groupedData.length === 0 && (
              <tr>
                <td colSpan={totalColSpan} className="px-6 py-14 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

UsageTable.propTypes = {
  title: PropTypes.string.isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({
    field: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    align: PropTypes.string,
  })).isRequired,
  groupedData: PropTypes.array.isRequired,
  tableType: PropTypes.string.isRequired,
  sortBy: PropTypes.string.isRequired,
  sortOrder: PropTypes.string.isRequired,
  onToggleSort: PropTypes.func.isRequired,
  viewMode: PropTypes.string.isRequired,
  storageKey: PropTypes.string.isRequired,
  renderDetailCells: PropTypes.func.isRequired,
  renderSummaryCells: PropTypes.func.isRequired,
  emptyMessage: PropTypes.string.isRequired,
};

// Re-export utilities for use in UsageStats orchestrator
export { fmt, fmtCompact, fmtCost, fmtTime };
