// ESLint flat config for The Dye Ledger single-file PWA.
export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "*.min.js"
    ]
  },
  {
    files: ["app.js", "service-worker.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        caches: "readonly",
        self: "readonly",
        fetch: "readonly",
        console: "readonly",
        performance: "readonly",
        Intl: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        CustomEvent: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        crypto: "readonly",
        indexedDB: "readonly",
        atob: "readonly",
        btoa: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        Event: "readonly",
        MessageChannel: "readonly",
        supabase: "readonly",
        html2canvas: "readonly",
        jspdf: "readonly",
        jsPDF: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["warn", { "args": "none", "varsIgnorePattern": "^_" }],
      "eqeqeq": "warn",
      "prefer-const": "warn",
      "no-console": "off"
    }
  }
];
