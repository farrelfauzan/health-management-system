import type { ReactElement } from 'react';

import { DemoCtaSection } from '#components/server/landing/demo-cta-section';
import { HeroSection } from '#components/server/landing/hero-section';
import { MetaSection } from '#components/server/landing/meta-section';
import { MikoSection } from '#components/server/landing/miko-section';
import { ModulesSection } from '#components/server/landing/modules-section';
import { ScreensSection } from '#components/server/landing/screens-section';
import { SiteFooter } from '#components/server/landing/site-footer';
import { SiteHeader } from '#components/server/landing/site-header';
import { StructuredData } from '#components/server/landing/structured-data';
import { SwitchAndSecuritySection } from '#components/server/landing/switch-and-security-section';
import { BrandSvgDefs } from '#components/shared/brand-svg-defs';

/** The MetaKlinik marketing page. */
export default function LandingPage(): ReactElement {
  return (
    <>
      <StructuredData />
      <BrandSvgDefs />
      <div className="progress" aria-hidden="true" />
      <SiteHeader />
      <main className="overflow-x-clip">
        <HeroSection />
        <MetaSection />
        <ModulesSection />
        <ScreensSection />
        <MikoSection />
        <SwitchAndSecuritySection />
        <DemoCtaSection />
      </main>
      <SiteFooter />
    </>
  );
}
