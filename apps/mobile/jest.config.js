module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/node_modules/@react-native-async-storage/async-storage',
    '^react$': '<rootDir>/node_modules/react',
    '^react-native($|/.*)': '<rootDir>/node_modules/react-native$1',
    '^react-native-safe-area-context$': '<rootDir>/node_modules/react-native-safe-area-context',
  },
  transformIgnorePatterns: [
    'node_modules/.pnpm/(?!(react-native|@react-native\\+[^/]+|@react-native-community\\+[^/]+|@react-native-async-storage\\+async-storage|react-test-renderer|react-native-safe-area-context)@)',
    'node_modules/(?!\\.pnpm|((jest-)?react-native|@react-native(-community)?|@react-native-async-storage/async-storage|react-native-safe-area-context)/)',
  ],
};
