import type { LineMessage } from './client';
import { getLineServerConfig } from './config';

export interface BookingFlexData {
  studentName: string;
  courseTitle: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  amount?: number;
  netAmount?: number;
  statusText?: string;
  statusColor?: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface AttendanceFlexData {
  studentName: string;
  sessionDate: string;
  courseTitle?: string;
  status: 'present' | 'absent' | 'late' | 'excused' | 'pending';
  note?: string;
  reportUrl?: string;
}

export interface PaymentFlexData {
  studentName: string;
  courseTitle: string;
  amount: number;
  paymentMethod?: string;
  status: 'pending' | 'paid';
  actionUrl?: string;
}

export interface SessionReportFlexData {
  studentName: string;
  courseTitle: string;
  sessionDate: string;
  summary?: string;
  strengths?: string;
  improvements?: string;
  homework?: string;
  reportUrl?: string;
}

function moneyText(val: number | undefined): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '- บาท';
  return `${val.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

function getAppUrl(path: string): string {
  const config = getLineServerConfig();
  if (config.liffId) {
    return `https://liff.line.me/${config.liffId}${path.startsWith('/') ? path : `/${path}`}`;
  }
  return `${config.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function createBookingFlexMessage(
  title: string,
  badgeText: string,
  badgeColor: string,
  data: BookingFlexData,
  role: 'parent' | 'teacher' = 'parent'
): LineMessage {
  const actionUrl = data.actionUrl || getAppUrl(role === 'teacher' ? '/schedule' : '/my-bookings');
  const actionLabel = data.actionLabel || (role === 'teacher' ? 'ดูตารางสอน' : 'ดูการจองของฉัน');

  return {
    type: 'flex',
    altText: `${title}: ${data.courseTitle} (${data.studentName})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4F46E5',
        paddingAll: '16px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: title,
                weight: 'bold',
                color: '#FFFFFF',
                size: 'md',
                flex: 1,
              },
              {
                type: 'text',
                text: badgeText,
                size: 'xs',
                color: '#FFFFFF',
                align: 'end',
                weight: 'bold',
              },
            ],
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: data.courseTitle,
            weight: 'bold',
            size: 'lg',
            color: '#1E293B',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '👤 นักเรียน:', size: 'sm', color: '#64748B', width: '80px' },
                  { type: 'text', text: data.studentName, size: 'sm', color: '#1E293B', weight: 'bold', flex: 1 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '📅 วันเรียน:', size: 'sm', color: '#64748B', width: '80px' },
                  { type: 'text', text: data.bookingDate, size: 'sm', color: '#1E293B', flex: 1 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '⏰ เวลา:', size: 'sm', color: '#64748B', width: '80px' },
                  { type: 'text', text: `${data.startTime} - ${data.endTime} น.`, size: 'sm', color: '#1E293B', flex: 1 },
                ],
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: '📍 สถานที่:', size: 'sm', color: '#64748B', width: '80px' },
                  { type: 'text', text: data.location || 'คลาสออนไลน์ / รอระบุ', size: 'sm', color: '#1E293B', wrap: true, flex: 1 },
                ],
              },
              ...(typeof (role === 'teacher' ? data.netAmount : data.amount) === 'number'
                ? [
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        {
                          type: 'text',
                          text: role === 'teacher' ? '💰 ผลตอบแทน:' : '💳 ค่าเรียน:',
                          size: 'sm',
                          color: '#64748B',
                          width: '80px',
                        },
                        {
                          type: 'text',
                          text: moneyText(role === 'teacher' ? data.netAmount : data.amount),
                          size: 'sm',
                          color: '#059669',
                          weight: 'bold',
                          flex: 1,
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#4F46E5',
            height: 'sm',
            action: {
              type: 'uri',
              label: actionLabel,
              uri: actionUrl,
            },
          },
        ],
      },
    },
  };
}

export function createAttendanceFlexMessage(data: AttendanceFlexData): LineMessage {
  const statusConfig = {
    present: { label: 'เข้าเรียนตรงเวลา', color: '#059669', icon: '✅' },
    late: { label: 'มาสาย', color: '#D97706', icon: '⚠️' },
    absent: { label: 'ขาดเรียน', color: '#DC2626', icon: '❌' },
    excused: { label: 'ลาเรียน / มีเหตุจำเป็น', color: '#2563EB', icon: '📝' },
    pending: { label: 'รอเช็คชื่อ', color: '#64748B', icon: '⏳' },
  }[data.status] || { label: data.status, color: '#64748B', icon: 'ℹ️' };

  const targetUrl = data.reportUrl || getAppUrl('/progress');

  return {
    type: 'flex',
    altText: `แจ้งสถานะเข้าเรียน: ${data.studentName} (${statusConfig.label})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: statusConfig.color,
        paddingAll: '14px',
        contents: [
          {
            type: 'text',
            text: `📋 แจ้งเช็คชื่อเข้าเรียน`,
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
            flex: 1,
          },
          {
            type: 'text',
            text: `${statusConfig.icon} ${statusConfig.label}`,
            size: 'sm',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'end',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: data.studentName,
            weight: 'bold',
            size: 'lg',
            color: '#1E293B',
          },
          ...(data.courseTitle
            ? [
                {
                  type: 'text',
                  text: data.courseTitle,
                  size: 'sm',
                  color: '#64748B',
                },
              ]
            : []),
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'วันที่เรียน:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: data.sessionDate, size: 'sm', color: '#1E293B', weight: 'bold', flex: 1 },
            ],
          },
          ...(data.note
            ? [
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'md',
                  paddingAll: '10px',
                  backgroundColor: '#F8FAFC',
                  cornerRadius: '8px',
                  contents: [
                    { type: 'text', text: 'บันทึกจากคุณครู:', size: 'xs', color: '#64748B', weight: 'bold' },
                    { type: 'text', text: data.note, size: 'sm', color: '#334155', wrap: true, margin: 'xs' },
                  ],
                },
              ]
            : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'ดูผลการเรียนและพัฒนาการ',
              uri: targetUrl,
            },
          },
        ],
      },
    },
  };
}

export function createPaymentFlexMessage(data: PaymentFlexData): LineMessage {
  const isPaid = data.status === 'paid';
  const headerColor = isPaid ? '#059669' : '#D97706';
  const title = isPaid ? '💳 ยืนยันชำระเงินเรียบร้อย' : '💰 แจ้งยอดชำระค่าเรียน';
  const badge = isPaid ? 'ชำระแล้ว' : 'รอชำระเงิน';
  const actionLabel = isPaid ? 'ดูประวัติและใบเสร็จ' : 'คลิกชำระเงินผ่าน LINE / PromptPay';
  const actionUrl = data.actionUrl || getAppUrl('/payments');

  return {
    type: 'flex',
    altText: `${title}: ${data.courseTitle} (${moneyText(data.amount)})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: headerColor,
        paddingAll: '14px',
        contents: [
          {
            type: 'text',
            text: title,
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
            flex: 1,
          },
          {
            type: 'text',
            text: badge,
            size: 'xs',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'end',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: data.courseTitle,
            weight: 'bold',
            size: 'md',
            color: '#1E293B',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'นักเรียน:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: data.studentName, size: 'sm', color: '#1E293B', weight: 'bold', flex: 1 },
            ],
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            alignItems: 'center',
            contents: [
              { type: 'text', text: 'ยอดรวม:', size: 'md', color: '#64748B', width: '80px' },
              { type: 'text', text: moneyText(data.amount), size: 'xl', color: headerColor, weight: 'bold', flex: 1 },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: headerColor,
            height: 'sm',
            action: {
              type: 'uri',
              label: actionLabel,
              uri: actionUrl,
            },
          },
        ],
      },
    },
  };
}

export function createSessionReportFlexMessage(data: SessionReportFlexData): LineMessage {
  const targetUrl = data.reportUrl || getAppUrl('/progress');

  return {
    type: 'flex',
    altText: `📝 สมุดพกรายงานผลการเรียน: ${data.studentName} (${data.courseTitle})`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#6366F1',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '📝 สมุดพกสรุปผลการเรียน',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
          },
          {
            type: 'text',
            text: `วันที่ ${data.sessionDate} • ${data.studentName}`,
            size: 'xs',
            color: '#E0E7FF',
            margin: 'xs',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: data.courseTitle,
            weight: 'bold',
            size: 'md',
            color: '#1E293B',
          },
          ...(data.summary
            ? [
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    { type: 'text', text: '💡 สิ่งที่ได้เรียนรู้ในคาบนี้:', size: 'xs', color: '#4F46E5', weight: 'bold' },
                    { type: 'text', text: data.summary, size: 'sm', color: '#334155', wrap: true, margin: 'xs' },
                  ],
                },
              ]
            : []),
          ...(data.strengths
            ? [
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    { type: 'text', text: '🌟 จุดเด่น / สิ่งที่ทำได้ดี:', size: 'xs', color: '#059669', weight: 'bold' },
                    { type: 'text', text: data.strengths, size: 'sm', color: '#334155', wrap: true, margin: 'xs' },
                  ],
                },
              ]
            : []),
          ...(data.improvements
            ? [
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    { type: 'text', text: '🎯 จุดที่ควรฝึกฝนเพิ่มเติม:', size: 'xs', color: '#D97706', weight: 'bold' },
                    { type: 'text', text: data.improvements, size: 'sm', color: '#334155', wrap: true, margin: 'xs' },
                  ],
                },
              ]
            : []),
          ...(data.homework
            ? [
                {
                  type: 'box',
                  layout: 'vertical',
                  paddingAll: '10px',
                  backgroundColor: '#FEF3C7',
                  cornerRadius: '8px',
                  contents: [
                    { type: 'text', text: '📚 การบ้าน / ข้อฝึกหัด:', size: 'xs', color: '#92400E', weight: 'bold' },
                    { type: 'text', text: data.homework, size: 'sm', color: '#78350F', wrap: true, margin: 'xs' },
                  ],
                },
              ]
            : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#6366F1',
            height: 'sm',
            action: {
              type: 'uri',
              label: 'ดูประวัติพัฒนาการทั้งหมด',
              uri: targetUrl,
            },
          },
        ],
      },
    },
  };
}

export function createQuickClassReminderFlexMessage(data: {
  studentName: string;
  courseTitle: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingLink?: string;
  minutesRemaining?: number;
  role?: 'parent' | 'teacher';
}): LineMessage {
  const role = data.role || 'parent';
  const actionUrl = data.meetingLink || getAppUrl(role === 'teacher' ? '/schedule' : '/my-bookings');
  const actionLabel = data.meetingLink ? 'เข้าห้องเรียนออนไลน์' : (role === 'teacher' ? 'ดูตารางสอน' : 'ดูรายละเอียดคลาส');

  return {
    type: 'flex',
    altText: `⏰ เตือนคาบเรียน: ${data.courseTitle} กำลังจะเริ่มเรียนใน ${data.minutesRemaining || 30} นาที`,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'horizontal',
        backgroundColor: '#EC4899',
        paddingAll: '14px',
        contents: [
          {
            type: 'text',
            text: '⏰ ใกล้ถึงเวลาเริ่มเรียนแล้วค่ะ!',
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
            flex: 1,
          },
          {
            type: 'text',
            text: `อีก ${data.minutesRemaining || 30} นาที`,
            size: 'xs',
            color: '#FFFFFF',
            weight: 'bold',
            align: 'end',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: data.courseTitle,
            weight: 'bold',
            size: 'lg',
            color: '#1E293B',
            wrap: true,
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
              { type: 'text', text: 'ผู้เรียน:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: data.studentName, size: 'sm', color: '#1E293B', weight: 'bold', flex: 1 },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'เวลา:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: `${data.startTime} - ${data.endTime} น.`, size: 'sm', color: '#1E293B', weight: 'bold', flex: 1 },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'สถานที่:', size: 'sm', color: '#64748B', width: '80px' },
              { type: 'text', text: data.location || (data.meetingLink ? 'ห้องเรียนออนไลน์' : 'ตามที่นัดหมาย'), size: 'sm', color: '#1E293B', flex: 1, wrap: true },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#EC4899',
            height: 'sm',
            action: {
              type: 'uri',
              label: actionLabel,
              uri: actionUrl,
            },
          },
        ],
      },
    },
  };
}
