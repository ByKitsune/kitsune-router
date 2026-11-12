import RuntimeI18nBoundary from "./RuntimeI18nBoundary";

// This module is also callable from Server Components. The component itself is
// passed as rendered children, never as a function prop across the RSC boundary.
export default function withRuntimeI18nPage(Page) {
  return function HydratedTranslationPage(props) {
    return <RuntimeI18nBoundary><Page {...props} /></RuntimeI18nBoundary>;
  };
}
