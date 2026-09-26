import { useEffect } from 'react';
import { registerBackHandler, isNative } from '../lib/nativeBridge';

/**
 * Hook to automatically register a modal's close handler to the native Android Back button.
 * Only active when `isOpen` is true and running on a native Capacitor platform.
 * Unregisters automatically on modal close or unmount.
 */
export function useModalBackHandler(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isNative || !isOpen) return;

    return registerBackHandler(() => {
      onClose();
      return true;
    });
  }, [isOpen, onClose]);
}
