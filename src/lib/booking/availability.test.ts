import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAvailableBookingSlots,
  validateBookingSlot,
  type AvailabilityBooking,
  type AvailabilitySchedule,
// @ts-expect-error Node's built-in TypeScript runner needs the explicit extension.
} from './availability.ts';

const recurringSchedule: AvailabilitySchedule = {
  id: 'schedule-1',
  courseId: 'course-1',
  teacherId: 'teacher-1',
  dayOfWeek: 1,
  startTime: '16:30:00',
  endTime: '18:00:00',
  start_date: '2026-08-24',
  end_date: null,
  isRecurring: true,
  isActive: true,
};

test('builds course-duration slots from a recurring teacher schedule', () => {
  const slots = buildAvailableBookingSlots({
    schedules: [recurringSchedule],
    bookings: [],
    courseDurationMinutes: 60,
    fromDate: '2026-08-24',
    daysAhead: 0,
  });

  assert.deepEqual(slots, [
    { scheduleId: 'schedule-1', date: '2026-08-24', startTime: '16:30', endTime: '17:30' },
    { scheduleId: 'schedule-1', date: '2026-08-24', startTime: '17:00', endTime: '18:00' },
  ]);
});

test('supports canonical schedule date fields and non-recurring schedules', () => {
  const slots = buildAvailableBookingSlots({
    schedules: [{
      ...recurringSchedule,
      id: 'schedule-2',
      dayOfWeek: 2,
      startDate: '2026-08-25',
      endDate: '2026-08-25',
      start_date: undefined,
      end_date: undefined,
      isRecurring: false,
    }],
    bookings: [],
    courseDurationMinutes: 60,
    fromDate: '2026-08-24',
    daysAhead: 1,
  });

  assert.deepEqual(slots, [
    { scheduleId: 'schedule-2', date: '2026-08-25', startTime: '16:30', endTime: '17:30' },
    { scheduleId: 'schedule-2', date: '2026-08-25', startTime: '17:00', endTime: '18:00' },
  ]);
});

test('excludes slots overlapping pending or confirmed teacher bookings', () => {
  const bookings: AvailabilityBooking[] = [
    { teacherId: 'teacher-1', bookingDate: '2026-08-24', startTime: '16:30', endTime: '17:30', status: 'pending' },
    { teacherId: 'teacher-1', bookingDate: '2026-08-24', startTime: '17:00', endTime: '18:00', status: 'cancelled' },
  ];

  const slots = buildAvailableBookingSlots({
    schedules: [recurringSchedule],
    bookings,
    courseDurationMinutes: 60,
    fromDate: '2026-08-24',
    daysAhead: 0,
  });

  assert.deepEqual(slots, []);
});

test('rejects a manually crafted time that is not a generated schedule slot', () => {
  const result = validateBookingSlot({
    schedule: recurringSchedule,
    bookingDate: '2026-08-24',
    startTime: '16:35',
    endTime: '17:35',
    courseDurationMinutes: 60,
    bookings: [],
  });

  assert.deepEqual(result, { ok: false, reason: 'slot_not_in_schedule' });
});

test('rejects a valid schedule slot when a pending booking overlaps it', () => {
  const result = validateBookingSlot({
    schedule: recurringSchedule,
    bookingDate: '2026-08-24',
    startTime: '17:00',
    endTime: '18:00',
    courseDurationMinutes: 60,
    bookings: [{
      teacherId: 'teacher-1',
      bookingDate: '2026-08-24',
      startTime: '16:30',
      endTime: '17:30',
      status: 'pending',
    }],
  });

  assert.deepEqual(result, { ok: false, reason: 'booking_conflict' });
});
