import { http, HttpResponse } from "msw";

const API = "/api";

/** Field Me ESS demo handlers — leave / balances / slips / expenses / employees. */
export const hrHandlers = [
  http.get(`${API}/hr/leave/balances`, () =>
    HttpResponse.json({
      items: [
        { leave_type: "Annual", allocated: 21, used: 10, balance: 11 },
        { leave_type: "Sick", allocated: 12, used: 3, balance: 9 },
        { leave_type: "Study", allocated: 5, used: 1, balance: 4 },
      ],
    }),
  ),

  http.get(`${API}/hr/leave`, () =>
    HttpResponse.json({
      items: [
        {
          id: "LV-2026-001",
          employee: "Demo Field Officer",
          leave_type: "Annual",
          from_date: "2026-10-02",
          to_date: "2026-10-04",
          status: "Pending",
        },
        {
          id: "LV-2026-002",
          employee: "Demo Field Officer",
          leave_type: "Sick",
          from_date: "2026-09-12",
          to_date: "2026-09-12",
          status: "Approved",
        },
      ],
    }),
  ),

  http.post(`${API}/hr/leave`, async ({ request }) => {
    const body = (await request.json()) as {
      leave_type?: string;
      from_date?: string;
      to_date?: string;
      confirm?: boolean;
    };
    if (!body.confirm) {
      return HttpResponse.json({ detail: "confirm required" }, { status: 400 });
    }
    return HttpResponse.json(
      {
        id: `LV-${Date.now().toString(36)}`,
        employee: "Demo Field Officer",
        leave_type: body.leave_type || "Annual",
        from_date: body.from_date ?? null,
        to_date: body.to_date ?? null,
        status: "Pending",
      },
      { status: 201 },
    );
  }),

  http.get(`${API}/hr/slips`, () =>
    HttpResponse.json({
      items: [
        {
          id: "SLIP-2026-01",
          employee: "Demo Field Officer",
          period: "January 2026",
          net_pay: 15200,
          status: "Paid",
        },
        {
          id: "SLIP-2025-12",
          employee: "Demo Field Officer",
          period: "December 2025",
          net_pay: 15200,
          status: "Paid",
        },
      ],
    }),
  ),

  http.post(`${API}/hr/expenses`, async ({ request }) => {
    const body = (await request.json()) as {
      amount?: number;
      expense_type?: string;
      description?: string;
      confirm?: boolean;
    };
    if (!body.confirm) {
      return HttpResponse.json({ detail: "confirm required" }, { status: 400 });
    }
    return HttpResponse.json(
      {
        id: `EXP-${Date.now().toString(36)}`,
        amount: Number(body.amount) || 0,
        expense_type: body.expense_type || "Other",
        description: body.description ?? null,
        status: "Pending",
      },
      { status: 201 },
    );
  }),

  http.get(`${API}/hr/employees`, () =>
    HttpResponse.json({
      items: [
        {
          id: "HR-EMP-0012",
          employee_name: "Demo Field Officer",
          department: "Certification",
          designation: "Certification Officer / Auditor",
          status: "Active",
          email: "field.demo@eswasa.local",
          initials: "DF",
          user_id: "field.demo",
        },
      ],
    }),
  ),
];
