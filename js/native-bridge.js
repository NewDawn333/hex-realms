'use strict';

// Bundled into www/js/native.js for the Capacitor Android shell.
// In a browser this file is not loaded; haptics.js falls back to Vibration API.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

function isNative() {
  return Capacitor.isNativePlatform();
}

window.HexNative = {
  isNative,

  async capture() {
    if (!isNative()) return;
    await Haptics.impact({ style: ImpactStyle.Heavy });
  },

  async starve() {
    if (!isNative()) return;
    await Haptics.notification({ type: NotificationType.Warning });
  },

  async build() {
    if (!isNative()) return;
    await Haptics.impact({ style: ImpactStyle.Light });
  },

  async turn() {
    if (!isNative()) return;
    await Haptics.impact({ style: ImpactStyle.Medium });
  },
};
