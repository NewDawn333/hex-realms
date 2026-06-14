'use strict';

// Haptic feedback: Capacitor plugin in the Android APK, Vibration API in mobile
// browser / PWA, silent on desktop.
const HapticsUtil = {
  _canVibrate() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  },

  _native(fn) {
    if (window.HexNative?.isNative?.()) {
      window.HexNative[fn]?.().catch(() => {});
      return true;
    }
    return false;
  },

  capture() {
    if (this._native('capture')) return;
    if (this._canVibrate()) navigator.vibrate([35, 25, 55]);
  },

  starve() {
    if (this._native('starve')) return;
    if (this._canVibrate()) navigator.vibrate([20, 40, 20, 40]);
  },

  build() {
    if (this._native('build')) return;
    if (this._canVibrate()) navigator.vibrate(18);
  },

  turn() {
    if (this._native('turn')) return;
    if (this._canVibrate()) navigator.vibrate(12);
  },
};
