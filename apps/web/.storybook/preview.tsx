import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";
import "../src/index.css";

const preview: Preview = {
  decorators: [
    withThemeByClassName({
      defaultTheme: "light",
      themes: {
        dark: "dark",
        light: "",
      },
    }),
  ],
  parameters: {
    a11y: {
      config: {
        rules: [
          { enabled: true, id: "color-contrast" },
          { enabled: true, id: "label" },
        ],
      },
    },
    backgrounds: {
      default: "app",
      values: [
        { name: "app", value: "var(--background)" },
        { name: "white", value: "#ffffff" },
        { name: "dark", value: "#0a0a0a" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
    viewport: {
      viewports: {
        desktop: {
          name: "Desktop",
          styles: { height: "900px", width: "1440px" },
        },
        mobile: {
          name: "Mobile",
          styles: { height: "667px", width: "375px" },
        },
        tablet: {
          name: "Tablet",
          styles: { height: "1024px", width: "768px" },
        },
      },
    },
  },
};

export default preview;
