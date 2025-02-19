module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current'
      }
    }],
    '@babel/preset-typescript',
    '@babel/preset-react'
  ],
  plugins: [
    '@babel/plugin-transform-class-properties',
    '@babel/plugin-transform-modules-commonjs',
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-transform-runtime'
  ]
}; 