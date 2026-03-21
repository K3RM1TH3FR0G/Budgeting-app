// ── STYLES ──
// Vite processes these as real CSS modules with hashed filenames,
// which is what lets us drop 'unsafe-inline' from the CSP.
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/auth.css';
import './styles/charts.css';
import './styles/pages.css';

// ── APP ──
// During Step 1, the entire application lives in app.js.
// Subsequent steps will split this into focused modules.
import './app.js';
