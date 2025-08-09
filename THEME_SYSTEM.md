# Theme System Documentation

The theme system allows for easy testing and switching between different color schemes globally across the application.

## Quick Start

### 1. Using the Theme Controller (Development)

Add the DevThemeController to your main App component:

```tsx
import { DevThemeController } from '@/components/theme-controller';

function App() {
  return (
    <div>
      {/* Your app content */}
      <DevThemeController />
    </div>
  );
}
```

### 2. Using Themes Programmatically

```tsx
import { useTheme } from '@/hooks/use-theme';

function MyComponent() {
  const { useDefaultTheme, useDarkTheme, useBlueTheme, setTheme } = useTheme();
  
  return (
    <div>
      <button onClick={useDefaultTheme}>Default</button>
      <button onClick={useDarkTheme}>Dark</button>
      <button onClick={useBlueTheme}>Blue</button>
    </div>
  );
}
```

## Available Theme Properties

Each theme can control the following properties independently:

| Property | Controls |
|----------|----------|
| `pageBackground` | Main page background color |
| `dividerColor` | All divider/separator colors |
| `dividerWidth` | Thickness of dividers |
| `iconBackground` | Background color of icons in circles |
| `borderColor` | Default border colors |
| `borderWidth` | Default border thickness |
| `borderFocusColor` | Border color when focused |
| `reportCardBackground` | Background of expandable report sections |
| `reportCardBorder` | Border color of report sections |
| `articleCardBackground` | Background of article cards |
| `articleCardBorder` | Border color of article cards |
| `articleCardHoverBackground` | Article card background on hover |
| `sidebarTextColor` | Text color in sidebar |
| `sidebarBackground` | Sidebar background color |
| `sidebarBorderColor` | Sidebar border color |
| `headerTextColor` | Main header text |
| `headlineTextColor` | Headline text |
| `researchCardHeaderTextColor` | Research section headers |
| `bodyTextColor` | General body text |
| `mutedTextColor` | Muted/secondary text |

## CSS Classes for Theme Integration

Use these utility classes in your components:

```tsx
<div className="theme-page-bg">
  <h1 className="theme-header-text">Header</h1>
  <div className="theme-divider border-t"></div>
  <div className="theme-icon-bg rounded-full">
    <Icon />
  </div>
</div>
```

## Creating Custom Themes

```tsx
import { ThemeConfig } from '@/lib/theme';

const myCustomTheme: ThemeConfig = {
  pageBackground: 'rgb(255, 248, 240)', // cream
  dividerColor: 'rgb(139, 69, 19)', // saddle brown
  dividerWidth: '3px',
  iconBackground: 'rgb(139, 69, 19)',
  // ... other properties
};

// Apply the custom theme
const { setTheme } = useTheme();
setTheme(myCustomTheme);
```

## Integration Example

To integrate the theme system with existing components, replace hardcoded colors:

### Before:
```tsx
<div className="bg-gray-50 border-2 border-gray-200">
  <h1 className="text-gray-900">Title</h1>
</div>
```

### After:
```tsx
<div className="theme-page-bg theme-border border-2">
  <h1 className="theme-header-text">Title</h1>
</div>
```

## Available Preset Themes

1. **Default Theme**: Current application colors
2. **Dark Theme**: Dark mode with light text
3. **Blue Theme**: Blue-focused color scheme

## Development Tools

The DevThemeController provides:
- Quick theme switching buttons
- Theme property inspector
- Real-time theme preview
- Only appears in development mode

## CSS Variables

All theme properties are available as CSS custom properties:

```css
.my-custom-element {
  background-color: var(--page-bg);
  border: var(--border-width) solid var(--border-color);
  color: var(--header-text-color);
}
```