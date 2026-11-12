import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import ConsoleLogClient from "./ConsoleLogClient";

// Force dynamic so Next.js standalone build includes the server-side JS file
export const dynamic = "force-dynamic";

function ConsoleLogPage() {
  return <ConsoleLogClient />;
}

export default withRuntimeI18nPage(ConsoleLogPage);
