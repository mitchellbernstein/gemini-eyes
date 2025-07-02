/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable static export for deployment
  output: 'export',
  trailingSlash: true,
  // Disable image optimization for static export
  images: {
    unoptimized: true,
    domains: ['lh3.googleusercontent.com'],
  },
  // Remove rewrites for static export (API calls will use full URLs)
}

module.exports = nextConfig 