import { createRoute } from '@granite-js/react-native';
import React from 'react';
import FarmGame from '../farm/FarmGame';

export const Route = createRoute('/', {
  component: Page,
});

function Page() {
  return <FarmGame />;
}
