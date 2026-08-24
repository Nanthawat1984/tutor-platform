export type RoleRoute = 'teacher' | 'parent' | 'admin' | undefined | null;

export function getRoleHomePath(role: RoleRoute): string {
  if (role === 'teacher') return '/dashboard';
  if (role === 'admin') return '/admin/dashboard';
  return '/my-bookings';
}
