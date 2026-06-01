import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={`bg-gray-800 rounded-lg shadow-lg p-6 ${className}`}
    {...props}
  >
    {children}
  </div>
));

Card.displayName = 'Card';

export default Card;
