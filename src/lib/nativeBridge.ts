import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';

export const isNative =
  Capacitor.isNativePlatform() ||
  (typeof window !== 'undefined' &&
    (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios'));

// Modal & Overlay Back Button Stack (LIFO: topmost modal closes first)
const backHandlerStack: Array<() => boolean> = [];

/**
 * Registers a handler for the Android hardware/gesture back button.
 * Handlers are evaluated in reverse order (topmost first).
 * Returning `true` indicates the back action was consumed (e.g. modal closed).
 * Returns an unregister function.
 */
export function registerBackHandler(handler: () => boolean): () => void {
  backHandlerStack.push(handler);
  return () => {
    const idx = backHandlerStack.lastIndexOf(handler);
    if (idx !== -1) {
      backHandlerStack.splice(idx, 1);
    }
  };
}

let screenBackHandler: (() => boolean) | null = null;

/**
 * Registers the root screen-level navigation back handler.
 * Called when no modal overlays are active.
 */
export function setScreenBackHandler(handler: (() => boolean) | null): void {
  screenBackHandler = handler;
}

let isInitialized = false;

/**
 * Initializes Capacitor native bridge features (Status Bar, Keyboard, Hardware Back Button).
 * Strictly a NO-OP when running in desktop/mobile web browsers.
 */
export async function initNativeBridge(): Promise<void> {
  if (!isNative || isInitialized) return;
  isInitialized = true;

  // 1. Status Bar Setup
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#f6f7fb' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Graceful fallback on devices/webviews without status bar control
  }

  // 2. Virtual Keyboard Setup
  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    // Graceful fallback
  }

  // 3. Android Hardware / Gesture Back Button Listener
  try {
    await CapacitorApp.addListener('backButton', () => {
      // 3a. Close top active modal if any registered
      if (backHandlerStack.length > 0) {
        const topHandler = backHandlerStack[backHandlerStack.length - 1];
        try {
          const handled = topHandler();
          if (handled) return;
        } catch {
          // If error in handler, pop and continue
          backHandlerStack.pop();
        }
      }

      // 3b. Screen navigation back handler (e.g. Profile -> Dashboard, Login -> Welcome)
      if (screenBackHandler) {
        try {
          const handled = screenBackHandler();
          if (handled) return;
        } catch {
          // Fall through
        }
      }

      // 3c. At root screen with nothing to close: minimize/exit app cleanly
      CapacitorApp.exitApp();
    });
  } catch {
    // Graceful fallback
  }
}
