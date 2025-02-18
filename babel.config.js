module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current'
      },
      modules: 'commonjs'
    }],
    '@babel/preset-typescript',
    '@babel/preset-react'
  ],
  plugins: [
    ['@babel/plugin-transform-runtime', {
      regenerator: true,
      corejs: 3,
      helpers: true
    }],
    '@babel/plugin-transform-modules-commonjs',
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-private-methods',
    '@babel/plugin-proposal-private-property-in-object',
    '@babel/plugin-transform-async-to-generator'
  ]
}; 