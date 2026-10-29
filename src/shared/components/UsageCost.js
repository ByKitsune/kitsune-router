"use client";

import PropTypes from "prop-types";
import { fmtCost } from "@/shared/utils/format";
import { translate } from "@/i18n/runtime";

export default function UsageCost({ value, coverage }) {
  const unknownRequests = coverage?.unknownRequests;
  const hasUnpricedRequests = Number.isSafeInteger(unknownRequests) && unknownRequests > 0;
  const known = Number.isFinite(value) && value >= 0 && !hasUnpricedRequests;
  const hasSubtotal = !known && Number.isFinite(coverage?.knownCost) && coverage.knownCost > 0;
  return (
    <span title={known ? translate("{cost} local estimate", { cost: `$${value.toFixed(8)}` }) : undefined}>
      {hasSubtotal ? <>{fmtCost(coverage.knownCost)} <span className="text-xs">{translate("known subtotal")}</span></> : translate(fmtCost(known ? value : null))}
      {!known && hasUnpricedRequests && (
        <span className="block text-xs text-text-muted">{translate("{count} unpriced", { count: unknownRequests })}</span>
      )}
    </span>
  );
}

UsageCost.propTypes = {
  value: PropTypes.number,
  coverage: PropTypes.shape({ knownCost: PropTypes.number, unknownRequests: PropTypes.number }),
};
