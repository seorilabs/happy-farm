import { setup } from '@granite-js/react-native/jest';
// Register RNTL's built-in Jest matchers (toHaveTextContent, toBeVisible, etc.)
// globally for all test suites in this repo.
import '@testing-library/react-native';

setup({ rootDir: __filename });
