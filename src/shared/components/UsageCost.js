"use client";

import PropTypes from "prop-types";
import { fmtCost } from "@/shared/utils/format";
import { translate } from "@/i18n/runtime";

export default function UsageCost({ value, coverage }) {
  const unknownRequests = coverage?.unknownRequests;
  const hasUnpricedRequests = Number.isSafeInteger(unknownRequests) && unknownRequests > 0;
  const known = Number.isFinite(value) && value >= 0 && !hasUnpricedRequests;
  const hasSubtotal = !known && Number.isFinite(coverage?.knownCost) && coverage.knownCost > 0;
  const description = known
    ? translate("{cost} local estimate", { cost: `$${value.toFixed(8)}` })
    : hasSubtotal
      ? translate("Subtotal of priced requests. Unpriced requests are excluded.")
      : translate("No complete price was recorded for this cost.");
  return (
    <span className="inline-flex flex-col gap-0.5 align-middle" title={description}>
      <span className="whitespace-nowrap">{hasSubtotal ? fmtCost(coverage.knownCost) : translate(fmtCost(known ? value : null))}</span>
      {hasSubtotal && <> <span className="text-[10px] font-medium leading-4 tracking-normal text-text-muted">{translate("known subtotal")}</span></>}
      {!known && hasUnpricedRequests && (
        <> <span className="text-[10px] font-medium leading-4 tracking-normal text-warning">{translate("{count} unpriced", { count: unknownRequests })}</span></>
      )}
    </span>
  );
}

UsageCost.propTypes = {
  value: PropTypes.number,
  coverage: PropTypes.shape({ knownCost: PropTypes.number, unknownRequests: PropTypes.number }),
};
