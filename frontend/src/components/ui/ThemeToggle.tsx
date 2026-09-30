import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { IconButton } from './Button';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <IconButton label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle} className={className}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </IconButton>
  );
}
