import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const item = (to: string, label: string) => ({
  to,
  label,
});

/**
 * Mobile-first bottom navigation. Fixed to the bottom of the viewport on small
 * screens (hidden on md+ where pages carry their own links). Each item is a
 * full-height tap target with safe-area-inset-bottom padding for gesture nav.
 */
const MobileBottomNav: React.FC = () => {
  const user = useAuthStore((s) => s.user);

  const items = [
    item('/', 'Home'),
    item('/elections', 'Elections'),
    ...(user?.is_admin ? [item('/admin', 'Admin')] : []),
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-700 bg-gray-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {items.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                isActive ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default MobileBottomNav;