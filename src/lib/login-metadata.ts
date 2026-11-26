import { isIP } from "node:net";

export type LoginMetadata = {
  ip: string | null;
  navegador: string;
  sistema_operacional: string;
  mac_address: null;
  user_agent: string | null;
};

type RequestHeaders = Pick<Headers, "get">;

const UNKNOWN = "Não identificado";
const MAX_USER_AGENT_LENGTH = 1024;
const MAX_FORWARDED_FOR_LENGTH = 4096;

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159);
  });
}

function cleanUserAgent(value: string | null): string | null {
  if (!value) return null;
  const cleaned = Array.from(value.slice(0, MAX_USER_AGENT_LENGTH))
    .map((character) => hasControlCharacters(character) ? " " : character)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function validPort(value: string): boolean {
  return /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
}

function parseIp(value: string): string | null {
  // Scoped IPv6 addresses are local interface identifiers, not a portable client IP.
  if (!value || value.includes("%") || hasControlCharacters(value)) return null;
  if (isIP(value)) return value.toLowerCase();

  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(value);
  if (bracketed) {
    if (isIP(bracketed[1]) !== 6 || (bracketed[2] && !validPort(bracketed[2]))) return null;
    return bracketed[1].toLowerCase();
  }

  const ipv4WithPort = /^([^:]+):(\d+)$/.exec(value);
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4 && validPort(ipv4WithPort[2])) return ipv4WithPort[1];
  return null;
}

function readProxyIp(headers: RequestHeaders, trustProxy: boolean): string | null {
  if (!trustProxy) return null;
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded || forwarded.length > MAX_FORWARDED_FOR_LENGTH || hasControlCharacters(forwarded)) return null;

  // Opt-in assumes the app can only be reached through its trusted immediate proxy.
  // Traefik appends its client's RemoteAddr by default. Earlier values may be supplied
  // by the caller, so never use the leftmost address or fall back past an invalid tail.
  // With an additional CDN/proxy this identifies that immediate peer, not the end user.
  return parseIp(forwarded.split(",").at(-1)?.trim() ?? "");
}

function browserName(userAgent: string | null): string {
  if (!userAgent) return UNKNOWN;
  const browsers: Array<[RegExp, string]> = [
    [/(?:OPR|OPiOS)\/(\d+(?:\.\d+)*)/i, "Opera"],
    [/(?:Edg|EdgA|EdgiOS|Edge)\/(\d+(?:\.\d+)*)/i, "Microsoft Edge"],
    [/SamsungBrowser\/(\d+(?:\.\d+)*)/i, "Samsung Internet"],
    [/(?:Firefox|FxiOS)\/(\d+(?:\.\d+)*)/i, "Mozilla Firefox"],
    [/Chromium\/(\d+(?:\.\d+)*)/i, "Chromium"],
    [/(?:Chrome|CriOS)\/(\d+(?:\.\d+)*)/i, "Google Chrome"],
  ];
  for (const [pattern, name] of browsers) {
    const match = pattern.exec(userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  if (/\bOpera\//i.test(userAgent)) {
    const match = /Version\/(\d+(?:\.\d+)*)/i.exec(userAgent) ?? /Opera\/(\d+(?:\.\d+)*)/i.exec(userAgent);
    return match ? `Opera ${match[1]}` : "Opera";
  }
  if (/Safari\//i.test(userAgent)) {
    const match = /Version\/(\d+(?:\.\d+)*)/i.exec(userAgent);
    return match ? `Safari ${match[1]}` : "Safari";
  }
  return UNKNOWN;
}

function operatingSystem(userAgent: string | null): string {
  if (!userAgent) return UNKNOWN;
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    const match = /(?:CPU (?:iPhone )?OS|iPhone OS) (\d+(?:[_\.]\d+)*)/i.exec(userAgent);
    return match ? `iOS ${match[1].replace(/_/g, ".")}` : "iOS";
  }
  if (/Android/i.test(userAgent)) {
    const match = /Android[ /](\d+(?:\.\d+)*)/i.exec(userAgent);
    return match ? `Android ${match[1]}` : "Android";
  }
  if (/Windows/i.test(userAgent)) {
    const version = /Windows NT (\d+(?:\.\d+)*)/i.exec(userAgent)?.[1];
    const versions: Record<string, string> = { "10.0": "10 ou posterior", "6.3": "8.1", "6.2": "8", "6.1": "7", "6.0": "Vista", "5.1": "XP" };
    return version && versions[version] ? `Windows ${versions[version]}` : "Windows";
  }
  if (/CrOS/i.test(userAgent)) return "ChromeOS";
  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    // Desktop-mode iPad requests can be identical to macOS: do not invent a device.
    const match = /Mac OS X[ /](\d+(?:[_\.]\d+)*)/i.exec(userAgent);
    return match ? `macOS ${match[1].replace(/_/g, ".")}` : "macOS";
  }
  if (/Linux/i.test(userAgent)) return "Linux";
  return UNKNOWN;
}

/** Request metadata is declared by the client, not a verified device identity. */
export function readLoginMetadata(headers: RequestHeaders, options: { trustProxy?: boolean } = {}): LoginMetadata {
  const userAgent = cleanUserAgent(headers.get("user-agent"));
  return {
    ip: readProxyIp(headers, options.trustProxy === true),
    navegador: browserName(userAgent),
    sistema_operacional: operatingSystem(userAgent),
    // HTTP/browser requests do not expose the remote device's MAC address.
    mac_address: null,
    user_agent: userAgent,
  };
}
