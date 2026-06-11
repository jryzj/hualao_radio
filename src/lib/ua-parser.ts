// Lightweight User-Agent string parser — no external dependency.
//
// Pulls the device / OS / browser info we need for the visitor log.
// Designed to be defensive: anything we can't confidently identify
// falls back to a sensible "Unknown" string instead of throwing, so
// weird UAs (bots, curl, exotic embedded browsers) still produce a
// record rather than blowing up the POST handler.
//
// Returns:
//   deviceType:  "mobile" | "tablet" | "desktop"
//   deviceModel: best-effort model string (e.g. "iPhone", "Pixel 7",
//                "iPad"). Desktop browsers fall back to "Desktop".
//   deviceOs:    OS + major version (e.g. "iOS 17.4", "Android 14",
//                "Windows 11", "macOS 14.3"). Unknown → "Unknown".
//   deviceName:  browser + major version (e.g. "Chrome 125",
//                "Safari 17.4", "Edge 125"). Unknown → "Unknown".
//   userName:    "OS / Browser" combo. Falls back gracefully if one
//                side is missing.

export interface ParsedUA {
  deviceType: "mobile" | "tablet" | "desktop";
  deviceModel: string;
  deviceOs: string;
  deviceName: string;
  userName: string;
}

export function parseUA(ua: string): ParsedUA {
  const safe = (ua || "").trim();
  const lower = safe.toLowerCase();

  // --- Device type ----------------------------------------------------
  // iPad detection: modern iPadOS UAs include "Macintosh" with no
  // "Mobile" because they identify as desktop Safari. Touch hint
  // (`navigator.maxTouchPoints`) is needed to disambiguate, but we
  // don't have that here. Use "iPad" as a hint when present (older
  // iPadOS strings), otherwise rely on the iPad-in-Macintosh pattern
  // (iPadOS 13+).
  const isIpad = /ipad/.test(lower) ||
    (/macintosh/.test(lower) && !/iphone|ipod/.test(lower));
  const hasAndroid = /android/.test(lower);
  const hasMobile = /mobile/.test(lower);

  let deviceType: "mobile" | "tablet" | "desktop";
  if (isIpad) {
    deviceType = "tablet";
  } else if (hasAndroid && !hasMobile) {
    deviceType = "tablet";
  } else if (/iphone|ipod|android.*mobile|windows phone|blackberry|bb10/.test(lower)) {
    deviceType = "mobile";
  } else if (hasMobile) {
    deviceType = "mobile";
  } else {
    deviceType = "desktop";
  }

  // --- Device model ---------------------------------------------------
  // The model is in the parenthesised section of the UA. Try in order
  // of specificity. iPad / iPhone are picked up reliably; Android
  // devices sometimes include the model ("Pixel 7", "SM-S918B"); we
  // only return a value if we have a clear match.
  let deviceModel = "Desktop";
  if (isIpad) {
    deviceModel = "iPad";
  } else if (/iphone/.test(lower)) {
    deviceModel = "iPhone";
  } else if (/ipod/.test(lower)) {
    deviceModel = "iPod";
  } else if (hasAndroid) {
    // Try to extract a model from common Android UA patterns:
    //   "Android 14; Pixel 7"          → "Pixel 7"
    //   "Android 14; SM-S918B"         → "SM-S918B"
    //   "Android 14; HUAWEI ELE-AL00"  → "ELE-AL00"
    const m = lower.match(/android[^)]*;\s*([a-z0-9][\w\- ]*?)(?:\s+build\/|\))/);
    if (m && m[1]) {
      const model = m[1].trim();
      // Skip generic tokens that aren't real models
      if (!/^android$|^linux$|^kaios$|^harmonyos$/i.test(model)) {
        deviceModel = model;
      }
    }
    if (deviceModel === "Desktop") deviceModel = "Android";
  }

  // --- OS + version ---------------------------------------------------
  let deviceOs = "Unknown";
  // iOS: "iPhone OS 17_4" / "iPad OS 17_4" → "iOS 17.4"
  const ios = lower.match(/(?:iphone|ipad|ipod)\s+os\s+(\d+)[_.](\d+)(?:[_.](\d+))?/);
  if (ios) {
    const minor = ios[2] || "0";
    deviceOs = `iOS ${ios[1]}.${minor}`;
  } else {
    // Android: "Android 14"
    const android = lower.match(/android\s+(\d+(?:\.\d+)?)/);
    if (android) {
      deviceOs = `Android ${android[1]}`;
    } else {
      // Windows: "Windows NT 10.0" → "Windows 11" (NT 10.0 covers
      // both Win10 and Win11; we surface 11 because that's the
      // current mainstream target).
      const win = lower.match(/windows\s+nt\s+([\d.]+)/);
      if (win) {
        const nt = win[1];
        const map: Record<string, string> = {
          "10.0": "Windows 11",
          "6.3": "Windows 8.1",
          "6.2": "Windows 8",
          "6.1": "Windows 7",
        };
        deviceOs = map[nt] || `Windows NT ${nt}`;
      } else if (/mac os x|macintosh/.test(lower)) {
        // macOS: "Mac OS X 10_15_7" → "macOS 10.15.7". We don't try
        // to map to marketing names ("Sonoma", "Ventura") because the
        // numeric form is more honest and stable.
        const mac = lower.match(/mac\s+os\s+x\s+(\d+)[_.](\d+)(?:[_.](\d+))?/);
        if (mac) {
          deviceOs = `macOS ${mac[1]}.${mac[2]}`;
        } else {
          deviceOs = "macOS";
        }
      } else if (/cros|chromium os/.test(lower)) {
        deviceOs = "ChromeOS";
      } else if (/linux/.test(lower)) {
        deviceOs = "Linux";
      }
    }
  }

  // --- Browser + version ---------------------------------------------
  // Detection order matters: Edge / Opera / Chrome all include
  // "Chrome" and "Safari" tokens, so we have to look for the
  // vendor-specific one first.
  let deviceName = "Unknown";
  // Edge (Chromium-based): "Edg/125.0.0.0"
  if (/edg\//.test(lower)) {
    const v = lower.match(/edg\/([\d.]+)/);
    deviceName = v && v[1] ? `Edge ${v[1].split(".")[0]}` : "Edge";
  } else if (/opr\/|opera/.test(lower)) {
    const v = lower.match(/opr\/([\d.]+)/);
    deviceName = v && v[1] ? `Opera ${v[1].split(".")[0]}` : "Opera";
  } else if (/firefox\//.test(lower)) {
    const v = lower.match(/firefox\/([\d.]+)/);
    deviceName = v && v[1] ? `Firefox ${v[1].split(".")[0]}` : "Firefox";
  } else if (/chrome\//.test(lower) && !/chromium/.test(lower)) {
    const v = lower.match(/chrome\/([\d.]+)/);
    deviceName = v && v[1] ? `Chrome ${v[1].split(".")[0]}` : "Chrome";
  } else if (/safari\//.test(lower) && /version\//.test(lower)) {
    const v = lower.match(/version\/([\d.]+)/);
    deviceName = v && v[1] ? `Safari ${v[1].split(".")[0]}` : "Safari";
  } else if (/msie|trident/.test(lower)) {
    const v = lower.match(/(?:msie |rv:)([\d.]+)/);
    deviceName = v && v[1] ? `IE ${v[1].split(".")[0]}` : "IE";
  }

  // --- userName combo -------------------------------------------------
  const userName = deviceOs !== "Unknown" && deviceName !== "Unknown"
    ? `${deviceOs} / ${deviceName}`
    : deviceOs !== "Unknown"
      ? deviceOs
      : deviceName !== "Unknown"
        ? deviceName
        : "Unknown";

  return { deviceType, deviceModel, deviceOs, deviceName, userName };
}
