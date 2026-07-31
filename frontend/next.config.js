/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next lint` otherwise only walks its own default set of directories, which silently
  // excludes tests/ — lint passes while the test files are never looked at.
  eslint: {
    dirs: ['app', 'components', 'data', 'hooks', 'lib', 'types', 'tests'],
  },
  transpilePackages: ['three'],
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(glb|gltf)$/,
      type: 'asset/resource',
    });
    return config;
  },
};

module.exports = nextConfig;
