/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/**': ['./boardgames.db'],
  },
  serverExternalPackages: ['node:sqlite'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lytfcvrjruhalevlhjuc.supabase.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cf.geekdo-images.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
