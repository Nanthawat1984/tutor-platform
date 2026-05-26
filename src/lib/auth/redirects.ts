type UserRole = 'teacher' | 'parent' | 'admin' | undefined | null;

export function getPostLoginPath(role: UserRole) {
  if (role === 'teacher') return '/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/my-bookings';
}
