import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import { notFound } from "next/navigation";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { getMachineId } from "@/shared/utils/machine";
import ToolDetailClient from "./ToolDetailClient";

async function ToolDetailPage({ params }) {
  const { toolId } = await params;
  if (!CLI_TOOLS[toolId]) notFound();
  const machineId = await getMachineId();
  return <ToolDetailClient toolId={toolId} machineId={machineId} />;
}

export default withRuntimeI18nPage(ToolDetailPage);
