/**
 * Registers every domain store's hooks (task handlers, field-visit parents, sample parents, the LIMS
 * router, CRM signal generators). Each portal imports this once from main.tsx so cross-module
 * automation (R-V4, R-C3, R-M3, R-S3…) works whichever screen the user opens first.
 */
import "./crm";
import "./field";
import "./metrology";
import "./certification";
import "./standards";
import "./governance";
export {};
