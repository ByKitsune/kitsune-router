import { DashboardLayout } from "@/shared/components";
import RuntimeI18nBoundary from "@/i18n/RuntimeI18nBoundary";

export default function DashboardRootLayout({ children }) {
  return <RuntimeI18nBoundary><DashboardLayout>{children}</DashboardLayout></RuntimeI18nBoundary>;
}

