import React from 'react';
import { useOfflineSync } from '../hooks/useOfflineSync';

/**
 * Mounted once at app level so the offline-ballot sync listener is ALWAYS
 * active (ADR-008). A captured ballot is submitted automatically the moment
 * the device reconnects, regardless of which page the voter is on. Renders
 * nothing.
 */
const OfflineSync: React.FC = () => {
  useOfflineSync();
  return null;
};

export default OfflineSync;