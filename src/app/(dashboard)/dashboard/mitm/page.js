import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import MitmPageClient from "./MitmPageClient";

function MitmPage() {
  return <MitmPageClient />;
}

export default withRuntimeI18nPage(MitmPage);
