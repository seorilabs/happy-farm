import { setup } from '@granite-js/react-native/jest';
// Explicitly load RNTL's built-in matchers (toHaveTextContent, toBeVisible, etc.)
// RNTL 13 auto-registers them via its main index, but this import makes it explicit.
import '@testing-library/react-native';

setup({ rootDir: __filename });
