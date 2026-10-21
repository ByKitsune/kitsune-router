"use client";

import PropTypes from "prop-types";
import { fmtCost } from "@/shared/utils/format";

export default function UsageCost({ value, coverage }) {
  const hasSubtotal = value === null && Number.isFinite(coverage?.knownCost) && coverage.knownCost > 0;
  const unknownRequests = coverage?.unknownRequests;
  return (
    <span title={Number.isFinite(value) ? `$${value.toFixed(8)} local estimate` : undefined}>
      {hasSubtotal ? <>{fmtCost(coverage.knownCost)} <span className="text-xs">known subtotal</span></> : fmtCost(value)}
      {value === null && Number.isSafeInteger(unknownRequests) && unknownRequests > 0 && (
        <span className="block text-xs text-text-muted">{unknownRequests} unpriced</span>
      )}
    </span>
  );
}

UsageCost.propTypes = {
  value: PropTypes.number,
  coverage: PropTypes.shape({ knownCost: PropTypes.number, unknownRequests: PropTypes.number }),
};
