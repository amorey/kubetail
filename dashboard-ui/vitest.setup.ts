import { loadErrorMessages, loadDevMessages } from '@apollo/client/dev';
import '@testing-library/jest-dom'; // adds .toBeInTheDocument() to global `expect`
import { cleanup } from '@testing-library/react';

// Display apollo error messages in console
loadDevMessages();
loadErrorMessages();

afterEach(() => {
  cleanup();
});
