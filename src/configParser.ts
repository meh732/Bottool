/**
 * VPN Config Parser & Unlocker Utility
 * Fully implements NPVT (NapsternetV), V2ray (vmess, vless, ss, trojan), and OpenVPN customization
 */

// Helper to decode Base64 safely
function decodeBase64(str: string): string {
  try {
    return Buffer.from(str.trim(), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

// Helper to encode Base64 safely
function encodeBase64(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64');
}

// Recursively traverse and modify JSON keys
function processJsonObject(obj: any, newRemarks: string, adChannel: string): { modified: boolean; obj: any } {
  let modified = false;
  if (!obj || typeof obj !== 'object') {
    return { modified, obj };
  }

  // Handle Arrays
  if (Array.isArray(obj)) {
    const newArray = obj.map(item => {
      const res = processJsonObject(item, newRemarks, adChannel);
      if (res.modified) {
        modified = true;
      }
      return res.obj;
    });
    return { modified, obj: newArray };
  }

  // Handle Objects
  const newObj: any = {};
  for (const key of Object.keys(obj)) {
    let val = obj[key];

    // Check lock parameters
    if (['locked', 'lock', 'isLocked', 'lock_hwid', 'lock_hardware', 'hwidLock', 'block_hwid'].includes(key)) {
      if (val === true || val === 'true' || val === 1) {
        val = false;
        modified = true;
      }
    } else if (['lock_password', 'password', 'lock_pass'].includes(key) && key !== 'pass' && typeof val === 'string') {
      // Only clear passwords if they are related to config locks (not actual server password)
      if (key.includes('lock')) {
        val = '';
        modified = true;
      }
    } else if (['lockChannel', 'channel', 'ads', 'advertisement', 'promo', 'watermark'].includes(key)) {
      val = adChannel;
      modified = true;
    } else if (['remarks', 'remark', 'ps', 'name', 'title', 'configName'].includes(key)) {
      if (typeof val === 'string') {
        val = newRemarks;
        modified = true;
      }
    }

    // Recurse nested objects
    if (val && typeof val === 'object') {
      const recurseRes = processJsonObject(val, newRemarks, adChannel);
      if (recurseRes.modified) {
        modified = true;
      }
      val = recurseRes.obj;
    }

    newObj[key] = val;
  }

  return { modified, obj: newObj };
}

// Process a single V2ray link line (vmess, vless, trojan, ss)
export function processV2rayLink(link: string, newRemarks: string, adChannel: string): { modified: boolean; link: string } {
  const trimmed = link.trim();
  if (!trimmed) {
    return { modified: false, link: trimmed };
  }

  // VMESS Link: vmess://[Base64 JSON]
  if (trimmed.startsWith('vmess://')) {
    const base64Part = trimmed.substring(8);
    const decoded = decodeBase64(base64Part);
    if (decoded) {
      try {
        const json = JSON.parse(decoded);
        const res = processJsonObject(json, newRemarks, adChannel);
        // Ensure standard VMESS fields are also customized
        if (json.ps !== undefined) {
          json.ps = newRemarks;
        } else {
          json.ps = newRemarks;
        }
        // Inject custom banner/ad if possible or allowed
        const reEncoded = encodeBase64(JSON.stringify(json, null, 2));
        return { modified: true, link: `vmess://${reEncoded}` };
      } catch {
        // Fallback if not valid JSON
      }
    }
  }

  // VLESS, Trojan, Shadowsocks, ShadowsocksR Links: protocol://uuid@host:port?...#remarks
  const protocols = ['vless://', 'trojan://', 'ss://', 'ssr://'];
  for (const protocol of protocols) {
    if (trimmed.startsWith(protocol)) {
      const hashIndex = trimmed.indexOf('#');
      if (hashIndex !== -1) {
        const basePart = trimmed.substring(0, hashIndex);
        const encodedRemarks = encodeURIComponent(newRemarks);
        return { modified: true, link: `${basePart}#${encodedRemarks}` };
      } else {
        const encodedRemarks = encodeURIComponent(newRemarks);
        return { modified: true, link: `${trimmed}#${encodedRemarks}` };
      }
    }
  }

  return { modified: false, link: trimmed };
}

/**
 * Main parser entry point
 * Processes file content string and returns customized configuration
 */
export function customizeConfig(
  fileContent: string,
  fileName: string,
  newRemarks: string,
  adChannel: string
): { content: string; fileType: string; modified: boolean } {
  const trimmed = fileContent.trim();
  const lowercaseName = fileName.toLowerCase();

  // 1. Check for NPVT format
  if (lowercaseName.endsWith('.npvt') || trimmed.startsWith('{') || trimmed.startsWith('eJw') || trimmed.length > 50) {
    // A. Plaintext JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const json = JSON.parse(trimmed);
        const res = processJsonObject(json, newRemarks, adChannel);
        return {
          content: JSON.stringify(res.obj, null, 2),
          fileType: 'NPVT (Plaintext JSON)',
          modified: res.modified || true
        };
      } catch {
        // Fallback
      }
    }

    // B. Base64 Encoded JSON (very common in NapsternetV exports)
    const decoded = decodeBase64(trimmed);
    if (decoded && decoded.startsWith('{') && decoded.endsWith('}')) {
      try {
        const json = JSON.parse(decoded);
        const res = processJsonObject(json, newRemarks, adChannel);
        const reEncoded = encodeBase64(JSON.stringify(res.obj));
        return {
          content: reEncoded,
          fileType: 'NPVT (Base64 Encoded)',
          modified: res.modified || true
        };
      } catch {
        // Fallback
      }
    }
  }

  // 2. OpenVPN (.ovpn) files
  if (lowercaseName.endsWith('.ovpn') || trimmed.includes('client') && trimmed.includes('dev tun')) {
    // OpenVPN is plain text config
    // We can prepend comment headers with the channel and user custom branding, and scan for any profile name
    const lines = trimmed.split('\n');
    const headerLines = [
      `# ==========================================`,
      `# Customized by ${adChannel}`,
      `# Profile Name: ${newRemarks}`,
      `# Enjoy your secure high-speed VPN!`,
      `# ==========================================`,
      ''
    ];

    // Let's filter out existing headers if they were created by our bot before
    const cleanedLines = lines.filter(line => !line.startsWith('# =') && !line.includes('Customized by') && !line.includes('Profile Name:'));
    
    return {
      content: [...headerLines, ...cleanedLines].join('\n'),
      fileType: 'OpenVPN (.ovpn)',
      modified: true
    };
  }

  // 3. Simple list of V2ray configs/URLs
  if (trimmed.includes('vmess://') || trimmed.includes('vless://') || trimmed.includes('trojan://') || trimmed.includes('ss://')) {
    const lines = trimmed.split('\n');
    let modifiedCount = 0;
    const processedLines = lines.map(line => {
      const res = processV2rayLink(line, newRemarks, adChannel);
      if (res.modified) {
        modifiedCount++;
      }
      return res.link;
    });

    return {
      content: processedLines.join('\n'),
      fileType: 'V2ray Subscription / Config List',
      modified: modifiedCount > 0
    };
  }

  // 4. Any other text files (e.g., .sks, .hc, etc.)
  // We can just add custom watermarks or metadata headers if they are text, or rename them
  return {
    content: fileContent,
    fileType: lowercaseName.split('.').pop()?.toUpperCase() || 'Binary/Unknown',
    modified: false
  };
}
