/**
 * Demo staff directory — who can be assigned, their roles, leave and workload caps.
 * TODO: wire real — GET /org/staff (HRMS Employee + User roles) and HRMS Leave Application.
 * All names are fictional.
 */
import { isoIn } from "../store/localStore";

export type StaffMember = {
  name: string;
  email: string;
  title: string;
  team: string;
  roles: string[];
  /** Open-item cap for the smart pool (§5.2 step 4). */
  cap: number;
  disciplines?: string[];
  leave?: { from: string; to: string; note?: string };
  board?: boolean;
};

export const DEMO_STAFF: StaffMember[] = [
  { name: "Nomsa Dlamini", email: "n.dlamini@eswasa.co.sz", title: "Company Secretary", team: "Governance", roles: ["Company Secretary", "Eswasa Board Secretary"], cap: 20 },
  { name: "Sipho Mamba", email: "s.mamba@eswasa.co.sz", title: "Executive Director", team: "Executive", roles: ["Eswasa Board Member", "Desk User"], cap: 30 },
  { name: "Thandeka Simelane", email: "t.simelane@eswasa.co.sz", title: "Head of Certification", team: "Certification", roles: ["Certification Manager", "Scheme Manager"], cap: 18, disciplines: ["QMS", "Product"] },
  { name: "Bongani Hlophe", email: "b.hlophe@eswasa.co.sz", title: "Certification Officer", team: "Certification", roles: ["Certification Officer"], cap: 12, disciplines: ["Product"] },
  { name: "Zanele Maseko", email: "z.maseko@eswasa.co.sz", title: "Customer Service Officer", team: "Customer Service", roles: ["Customer Service", "Support Team"], cap: 15 },
  { name: "Phindile Shongwe", email: "p.shongwe@eswasa.co.sz", title: "Customer Service Manager", team: "Customer Service", roles: ["Customer Service Manager", "Customer Service"], cap: 15, leave: { from: isoIn(-1), to: isoIn(6), note: "Annual leave" } },
  { name: "Mandla Nxumalo", email: "m.nxumalo@eswasa.co.sz", title: "Quality Manager", team: "Quality", roles: ["Quality Manager"], cap: 12 },
  { name: "Lindiwe Dube", email: "l.dube@eswasa.co.sz", title: "Lead Auditor", team: "Certification", roles: ["Certification Auditor"], cap: 10, disciplines: ["QMS", "Food safety"] },
  { name: "Musa Khumalo", email: "m.khumalo@eswasa.co.sz", title: "Metrologist", team: "Metrology", roles: ["Eswasa Metrology Officer"], cap: 14, disciplines: ["Mass", "Volume"] },
  { name: "Ayanda Ndlovu", email: "a.ndlovu@eswasa.co.sz", title: "Lab Manager", team: "Metrology", roles: ["Eswasa Metrology Manager", "Lab Manager", "Eswasa Metrology Reviewer"], cap: 14 },
  { name: "Sibusiso Gama", email: "s.gama@eswasa.co.sz", title: "Head of Standards", team: "Standards", roles: ["Eswasa Standards Manager", "Head of Standards"], cap: 16 },
  { name: "Nokuthula Zwane", email: "n.zwane@eswasa.co.sz", title: "TC Secretary", team: "Standards", roles: ["Eswasa Standards Officer", "TC Secretary"], cap: 14 },
  { name: "Themba Motsa", email: "t.motsa@eswasa.co.sz", title: "Finance Manager", team: "Finance", roles: ["Accounts Manager"], cap: 18 },
  { name: "Lungile Mkhabela", email: "l.mkhabela@eswasa.co.sz", title: "Risk Officer", team: "Governance", roles: ["Eswasa Risk Officer"], cap: 12 },
  { name: "Gugu Nkambule", email: "g.nkambule@eswasa.co.sz", title: "HR Manager", team: "HR", roles: ["HR Manager"], cap: 15 },
  { name: "Vusi Magagula", email: "v.magagula@eswasa.co.sz", title: "Procurement Officer", team: "Procurement", roles: ["Purchase Manager"], cap: 15 },
];

/** Board and committee members (not Desk users — member view only). Fictional. */
export const DEMO_BOARD_MEMBERS = [
  "Dr. Khanyisile Vilakati",
  "Sipho Mamba",
  "Adv. Mbuso Tsabedze",
  "Ms. Busisiwe Hlatshwayo",
  "Mr. Jabulani Fakudze",
  "Prof. Nonhlanhla Mavuso",
  "Mr. Sandile Ginindza",
];

export function onLeave(s: StaffMember, at = new Date()): boolean {
  if (!s.leave) return false;
  return new Date(s.leave.from) <= at && at <= new Date(s.leave.to);
}

export function staffByName(name: string): StaffMember | undefined {
  return DEMO_STAFF.find((s) => s.name === name);
}

export function staffWithRole(role: string): StaffMember[] {
  return DEMO_STAFF.filter((s) => s.roles.includes(role));
}
