export interface ThemePickerProps {
    /** Visible label text (default "Theme"). */
    label?: string;
    /** Keep the label for screen readers only. */
    hideLabel?: boolean;
    className?: string;
}
export declare function ThemePicker({ label, hideLabel, className }: ThemePickerProps): import("react").ReactElement<{
    label: string | undefined;
    'hide-label': string | undefined;
    className: string | undefined;
}, string | import("react").JSXElementConstructor<any>>;
