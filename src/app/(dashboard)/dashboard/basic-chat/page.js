import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import BasicChatPageClient from "./BasicChatPageClient";

function BasicChatPage() {
  return <BasicChatPageClient />;
}

export default withRuntimeI18nPage(BasicChatPage);
