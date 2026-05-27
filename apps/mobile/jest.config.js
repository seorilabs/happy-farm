module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^react-native($|/.*)': '<rootDir>/node_modules/react-native$1',
  },
  transformIgnorePatterns: [
    'node_modules/.pnpm/(?!(react-native|@react-native\\+[^/]+|@react-native-community\\+[^/]+|react-test-renderer|react-native-safe-area-context)@)',
    'node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?|react-native-safe-area-context)/)',
  ],
};
