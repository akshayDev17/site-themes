// /_site/<build>/site.js: what composed pages run after parsing (deferred).
// Theme only: registers <site-theme-picker>, which the apps place themselves.
import { defineThemePicker } from '../../src/picker.js';

defineThemePicker();
