export interface ParentSearchRecord {
  uid?: string;
  displayName?: string;
  email?: string;
  phone?: string;
}

export interface ParentPaymentRecord {
  id?: string;
  status?: string;
  amount?: number;
}

export interface ParentActivitySummary {
  studentCount: number;
  bookingCount: number;
  paymentCount: number;
  paidAmount: number;
}

export function matchesParentSearch(parent: ParentSearchRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [parent.uid, parent.displayName, parent.email, parent.phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

export function summarizeParentActivity(
  students: readonly unknown[],
  bookings: readonly unknown[],
  payments: readonly ParentPaymentRecord[],
): ParentActivitySummary {
  return {
    studentCount: students.length,
    bookingCount: bookings.length,
    paymentCount: payments.length,
    paidAmount: payments.reduce((total, payment) => (
      payment.status === 'paid' && typeof payment.amount === 'number' && Number.isFinite(payment.amount)
        ? total + payment.amount
        : total
    ), 0),
  };
}
