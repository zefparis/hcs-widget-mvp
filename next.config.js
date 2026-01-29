/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Utiliser Turbopack (Next.js 16 default)
  turbopack: {},

  // Compiler options pour minification
  compiler: {
    // Supprimer console.log en production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error'],
    } : false,
  },

  async redirects() {
    return [
      {
        source: '/contact',
        destination: '/widget/demo.html',
        permanent: false,
      },
      {
        source: '/contact.html',
        destination: '/widget/demo.html',
        permanent: false,
      },
      {
        source: '/contact/index.html',
        destination: '/widget/demo.html',
        permanent: false,
      },
      {
        source: '/index.html',
        destination: '/widget/demo.html',
        permanent: false,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
