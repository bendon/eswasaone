/* Certification sub-views — exported individually for the router.
   The main CertificationPage renders SubTabs + <Outlet/>.
   Each sub-view is self-contained: fetches its own data. */
export { PipelineView } from "./PipelineView";
export { AuditsView } from "./AuditsView";
export { CertificatesView } from "./CertificatesView";