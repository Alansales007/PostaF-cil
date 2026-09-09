import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: ['/dashboard/:path*', '/publications/:path*', '/settings/:path*', '/api/social/:path*', '/api/media/:path*', '/api/publications/:path*'],
};
