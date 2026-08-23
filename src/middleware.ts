import { NextRequest, NextResponse } from 'next/server';

// IMPORTANT: Firebase Hosting strips ALL cookies from incoming requests
// EXCEPT the specially-named `__session` cookie. Using any other name means
// the middleware will never see the session on the deployed version.
// See: https://firebase.google.com/docs/hosting/manage-cache#using_cookies
const SESSION_COOKIE_NAME = '__session';

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/courses',
  '/schedule',
  '/attendance',
  '/earnings',
  '/students',
  '/profile',
  '/explore',
  '/bookings',
  '/progress',
  '/my-bookings',
  '/my-profile',
  '/my-students',
  '/teachers/',
  '/admin/',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isLoggedIn = Boolean(sessionToken);

  // Check if the current path matches any protected route
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // Redirect unauthenticated users away from protected routes
  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Do not redirect away from /login based only on cookie presence. Firebase
  // ID tokens expire, while middleware only checks whether __session exists.
  // A stale token would otherwise cause /login -> protected page -> /login.
  // LoginForm/AuthProvider handles valid Firebase users client-side, and the
  // protected server route remains responsible for verifying the token.
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files, images, etc.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
