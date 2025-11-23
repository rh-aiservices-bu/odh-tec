import React from "react";
import ReactDOM from "react-dom/client";
import App from '@app/index';
import './i18n/config';

// IMPORTANT: Import monaco-config BEFORE rendering the app
// This configures @monaco-editor/loader to use the webpack-bundled Monaco
// instead of loading from CDN (required for CodeEditor in DocumentRenderer)
import './app/utils/monaco-config';

if (process.env.NODE_ENV !== "production") {
  const config = {
    rules: [
      {
        id: 'color-contrast',
        enabled: false
      }
    ]
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires, no-undef
  const axe = require("react-axe");
  axe(React, ReactDOM, 1000, config);
}

const root = ReactDOM.createRoot(document.getElementById("root") as Element);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
