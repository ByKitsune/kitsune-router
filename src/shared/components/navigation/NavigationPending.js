"use client";

import { useLinkStatus } from "next/link";

/** Fixed-space feedback owned by the router, including cancelled navigations. */
export default function NavigationPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-navigation-pending={pending ? "true" : "false"} className="dashboard-nav-pending" />;
}
