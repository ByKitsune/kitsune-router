import withRuntimeI18nPage from "@/i18n/withRuntimeI18nPage";
import Navigation from "./components/Navigation";
import HeroSection from "./components/HeroSection";
import HowItWorks from "./components/HowItWorks";
import Features from "./components/Features";
import GetStarted from "./components/GetStarted";
import FAQ from "./components/FAQ";
import Footer from "./components/Footer";
import LandingMotion from "./components/LandingMotion";
import styles from "./landing.module.css";

function LandingPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <Navigation />
      <LandingMotion>
        <main id="main-content" tabIndex={-1}>
          <HeroSection />
          <HowItWorks />
          <Features />
          <GetStarted />
          <FAQ />
        </main>
      </LandingMotion>
      <Footer />
    </div>
  );
}

export default withRuntimeI18nPage(LandingPage);
