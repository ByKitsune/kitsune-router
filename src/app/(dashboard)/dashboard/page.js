import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import { getMachineId } from "@/shared/utils/machine";
import EndpointPageClient from "./endpoint/EndpointPageClient";

async function DashboardPage() {
  const machineId = await getMachineId();
  return <EndpointPageClient machineId={machineId} />;
}

export default withRuntimeI18nPage(DashboardPage);
