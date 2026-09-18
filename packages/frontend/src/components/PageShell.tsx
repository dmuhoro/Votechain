import React from 'react';

interface PageShellProps {
  title: string;
  children: React.ReactNode;
}

/**
 * Shared page chrome: gradient background, document title, centered content
 * column (with bottom padding clearing the mobile nav), and the mobile-first
 * bottom navigation on small screens.
 */
const PageShell: React.FC<PageShellProps> = ({ title, children }) => {
  React.useEffect(() => {
    document.title = `${title} · VoteChain`;
    return () => {
      document.title = 'VoteChain - Transparent. Tamper-proof. Trustless.';
    };
  }, [title]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <main className="mx-auto w-full max-w-6xl px-4 py-8 pb-24 md:pb-14">{children}</main>
    </div>
  );
};

export default PageShell;