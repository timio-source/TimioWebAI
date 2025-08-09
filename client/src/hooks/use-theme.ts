import { useState, useEffect } from 'react';
import { ThemeManager, ThemeConfig, defaultTheme, darkTheme, blueTheme } from '@/lib/theme';

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(ThemeManager.getCurrentTheme());

  const setTheme = (theme: ThemeConfig) => {
    ThemeManager.setTheme(theme);
    setCurrentTheme(theme);
  };

  // Initialize theme on mount
  useEffect(() => {
    ThemeManager.setTheme(currentTheme);
  }, []);

  return {
    currentTheme,
    setTheme,
    // Preset theme functions
    useDefaultTheme: () => setTheme(defaultTheme),
    useDarkTheme: () => setTheme(darkTheme),
    useBlueTheme: () => setTheme(blueTheme),
    // Available themes
    themes: {
      default: defaultTheme,
      dark: darkTheme,
      blue: blueTheme,
    },
  };
}

// Utility function to generate theme-aware class names
export function getThemeClasses() {
  return {
    pageBackground: 'theme-page-bg',
    divider: 'theme-divider',
    iconBackground: 'theme-icon-bg',
    border: 'theme-border',
    borderFocus: 'theme-border-focus',
    reportCardBackground: 'theme-report-card-bg',
    reportCardBorder: 'theme-report-card-border',
    articleCardBackground: 'theme-article-card-bg',
    articleCardBorder: 'theme-article-card-border',
    articleCardHover: 'theme-article-card-hover',
    sidebarText: 'theme-sidebar-text',
    sidebarBackground: 'theme-sidebar-bg',
    sidebarBorder: 'theme-sidebar-border',
    headerText: 'theme-header-text',
    headlineText: 'theme-headline-text',
    researchCardHeaderText: 'theme-research-card-header-text',
    bodyText: 'theme-body-text',
    mutedText: 'theme-muted-text',
  };
}