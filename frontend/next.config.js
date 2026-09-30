/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next lint` otherwise only walks its own default set of directories, which silently
  // excludes tests/, browser/ and scripts/ — lint passes while those files are never looked at.
  eslint: {
    dirs: ['app', 'browser', 'components', 'data', 'hooks', 'lib', 'scripts', 'types', 'tests'],
  },
};

module.exports = nextConfig;
