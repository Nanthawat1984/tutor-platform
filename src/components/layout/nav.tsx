import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  MapPin,
  School,
  Search,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

export const TEACHER_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'แดชบอร์ด', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/courses', label: 'คอร์สเรียน', icon: <BookOpen className="h-4 w-4" /> },
  { href: '/schedule', label: 'ตารางสอน', icon: <CalendarCheck className="h-4 w-4" /> },
  { href: '/attendance', label: 'เช็คชื่อ', icon: <ClipboardCheck className="h-4 w-4" /> },
  { href: '/locations', label: 'สถานที่สอน', icon: <MapPin className="h-4 w-4" /> },
  { href: '/earnings', label: 'รายได้', icon: <Wallet className="h-4 w-4" /> },
  { href: '/students', label: 'นักเรียน', icon: <Users className="h-4 w-4" /> },
];

export const PARENT_NAV_ITEMS: NavItem[] = [
  { href: '/my-bookings', label: 'แดชบอร์ด', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/explore', label: 'ค้นหาครู', icon: <Search className="h-4 w-4" /> },
  { href: '/bookings', label: 'การจอง', icon: <CalendarDays className="h-4 w-4" /> },
  { href: '/payments', label: 'การชำระเงิน', icon: <Wallet className="h-4 w-4" /> },
  { href: '/progress', label: 'ผลการเรียน', icon: <BarChart3 className="h-4 w-4" /> },
  { href: '/my-students', label: 'นักเรียนของฉัน', icon: <GraduationCap className="h-4 w-4" /> },
];

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: '/admin/dashboard', label: 'แดชบอร์ด', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/admin/teachers', label: 'จัดการครู', icon: <Users className="h-4 w-4" /> },
  { href: '/admin/parents', label: 'ผู้ปกครอง', icon: <UserRound className="h-4 w-4" /> },
  { href: '/admin/students', label: 'นักเรียน', icon: <School className="h-4 w-4" /> },
];
