const SLOT_STEP_MINUTES = 30;
const BLOCKING_BOOKING_STATUSES = new Set(['pending', 'confirmed']);

export interface AvailabilitySchedule {
  id: string;
  courseId: string;
  teacherId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  startDate?: string | null;
  endDate?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  isRecurring?: boolean;
  isActive?: boolean;
}

export interface AvailabilityBooking {
  teacherId?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: string;
}

export interface AvailableBookingSlot {
  scheduleId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface BuildAvailableBookingSlotsInput {
  schedules: AvailabilitySchedule[];
  bookings: AvailabilityBooking[];
  courseDurationMinutes: number;
  fromDate: string;
  daysAhead: number;
}

export type BookingSlotValidation =
  | { ok: true; slot: AvailableBookingSlot }
  | {
      ok: false;
      reason:
        | 'invalid_date'
        | 'invalid_time'
        | 'schedule_inactive'
        | 'schedule_not_in_date'
        | 'slot_not_in_schedule'
        | 'booking_conflict';
    };

export interface ValidateBookingSlotInput {
  schedule: AvailabilitySchedule | null;
  bookingDate: string;
  startTime: string;
  endTime: string;
  courseDurationMinutes: number;
  bookings: AvailabilityBooking[];
}

function parseDateString(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function addDays(value: string, days: number): string {
  const parsed = parseDateString(value);
  if (!parsed) return value;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + days);
  return [
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function dayOfWeek(value: string): number | null {
  const parsed = parseDateString(value);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

function parseTime(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const [hour, minute, second = 0] = value.split(':').map(Number);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 60 + minute + second / 60;
}

function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function scheduleStartDate(schedule: AvailabilitySchedule): string | null {
  return schedule.startDate ?? schedule.start_date ?? null;
}

function scheduleEndDate(schedule: AvailabilitySchedule): string | null {
  return schedule.endDate ?? schedule.end_date ?? null;
}

function scheduleMatchesDate(schedule: AvailabilitySchedule, date: string): boolean {
  const startDate = scheduleStartDate(schedule);
  const endDate = scheduleEndDate(schedule);
  if (!startDate || !parseDateString(startDate) || (endDate && !parseDateString(endDate))) return false;
  if (date < startDate || (endDate !== null && date > endDate)) return false;
  if (schedule.isRecurring === false) return date === startDate;
  return dayOfWeek(date) === schedule.dayOfWeek;
}

function timesOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && end > otherStart;
}

function hasBookingConflict(
  schedule: AvailabilitySchedule,
  date: string,
  start: number,
  end: number,
  bookings: AvailabilityBooking[],
): boolean {
  return bookings.some((booking) => {
    if (!BLOCKING_BOOKING_STATUSES.has(booking.status)) return false;
    if (booking.bookingDate !== date) return false;
    if (booking.teacherId && booking.teacherId !== schedule.teacherId) return false;
    const bookingStart = parseTime(booking.startTime);
    const bookingEnd = parseTime(booking.endTime);
    return bookingStart !== null && bookingEnd !== null && timesOverlap(start, end, bookingStart, bookingEnd);
  });
}

function candidateSlotsForSchedule(
  schedule: AvailabilitySchedule,
  date: string,
  courseDurationMinutes: number,
): AvailableBookingSlot[] {
  if (!schedule.isActive || !scheduleMatchesDate(schedule, date)) return [];
  if (!Number.isInteger(courseDurationMinutes) || courseDurationMinutes <= 0) return [];
  const scheduleStart = parseTime(schedule.startTime);
  const scheduleEnd = parseTime(schedule.endTime);
  if (scheduleStart === null || scheduleEnd === null || scheduleEnd <= scheduleStart) return [];

  const slots: AvailableBookingSlot[] = [];
  for (
    let start = scheduleStart;
    start + courseDurationMinutes <= scheduleEnd;
    start += SLOT_STEP_MINUTES
  ) {
    slots.push({
      scheduleId: schedule.id,
      date,
      startTime: formatTime(start),
      endTime: formatTime(start + courseDurationMinutes),
    });
  }
  return slots;
}

export function buildAvailableBookingSlots({
  schedules,
  bookings,
  courseDurationMinutes,
  fromDate,
  daysAhead,
}: BuildAvailableBookingSlotsInput): AvailableBookingSlot[] {
  if (!parseDateString(fromDate) || !Number.isInteger(daysAhead) || daysAhead < 0) return [];

  const slots: AvailableBookingSlot[] = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const date = addDays(fromDate, offset);
    for (const schedule of schedules) {
      for (const slot of candidateSlotsForSchedule(schedule, date, courseDurationMinutes)) {
        const start = parseTime(slot.startTime);
        const end = parseTime(slot.endTime);
        if (start !== null && end !== null && !hasBookingConflict(schedule, date, start, end, bookings)) {
          slots.push(slot);
        }
      }
    }
  }

  const unique = new Map<string, AvailableBookingSlot>();
  for (const slot of slots) {
    unique.set(`${slot.date}|${slot.startTime}|${slot.endTime}`, slot);
  }
  return [...unique.values()].sort((a, b) =>
    `${a.date}|${a.startTime}|${a.endTime}`.localeCompare(`${b.date}|${b.startTime}|${b.endTime}`),
  );
}

export function validateBookingSlot({
  schedule,
  bookingDate,
  startTime,
  endTime,
  courseDurationMinutes,
  bookings,
}: ValidateBookingSlotInput): BookingSlotValidation {
  if (!parseDateString(bookingDate)) return { ok: false, reason: 'invalid_date' };
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (start === null || end === null) return { ok: false, reason: 'invalid_time' };
  if (!schedule || !schedule.isActive) return { ok: false, reason: 'schedule_inactive' };
  if (!scheduleMatchesDate(schedule, bookingDate)) return { ok: false, reason: 'schedule_not_in_date' };

  const scheduleStart = parseTime(schedule.startTime);
  const scheduleEnd = parseTime(schedule.endTime);
  if (
    scheduleStart === null ||
    scheduleEnd === null ||
    end <= start ||
    end - start !== courseDurationMinutes ||
    start < scheduleStart ||
    end > scheduleEnd ||
    (start - scheduleStart) % SLOT_STEP_MINUTES !== 0
  ) return { ok: false, reason: 'slot_not_in_schedule' };

  if (hasBookingConflict(schedule, bookingDate, start, end, bookings)) {
    return { ok: false, reason: 'booking_conflict' };
  }

  return {
    ok: true,
    slot: {
      scheduleId: schedule.id,
      date: bookingDate,
      startTime: formatTime(start),
      endTime: formatTime(end),
    },
  };
}
