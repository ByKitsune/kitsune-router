import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import { getMachineId } from "@/shared/utils/machine";
import CLIToolsPageClient from "./CLIToolsPageClient";

async function CLIToolsPage() {
  const machineId = await getMachineId();
  return <CLIToolsPageClient machineId={machineId} />;
}

export default withRuntimeI18nPage(CLIToolsPage);
