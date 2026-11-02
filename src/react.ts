'use client';
// Thin React wrapper: registers the custom element after mount and renders it.
// The element draws into its shadow root, so React hydration never sees its
// children.
import { createElement, useEffect } from 'react';
import { PICKER_TAG, defineThemePicker } from './picker.js';

export interface ThemePickerProps {
  /** Visible label text (default "Theme"). */
  label?: string;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  className?: string;
}

export function ThemePicker({ label, hideLabel, className }: ThemePickerProps) {
  useEffect(() => {
    defineThemePicker();
  }, []);
  return createElement(PICKER_TAG, { label, 'hide-label': hideLabel ? '' : undefined, className });
}
