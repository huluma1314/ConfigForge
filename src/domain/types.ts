export type ConfigFormat = "qx" | "surge" | "clash";

export type ProxyType =
  | "ss"
  | "vmess"
  | "vless"
  | "trojan"
  | "hysteria"
  | "hysteria2"
  | "tuic"
  | "http"
  | "https"
  | "socks5"
  | "unknown";

export type RuleType =
  | "DOMAIN"
  | "DOMAIN-SUFFIX"
  | "DOMAIN-KEYWORD"
  | "IP-CIDR"
  | "IP-CIDR6"
  | "GEOIP"
  | "GEOSITE"
  | "USER-AGENT"
  | "PROCESS-NAME"
  | "URL-REGEX"
  | "FINAL"
  | "MATCH"
  | "UNKNOWN";

export type PolicyGroupType =
  | "select"
  | "url-test"
  | "fallback"
  | "load-balance"
  | "static"
  | "available"
  | "unknown";

export interface WarningItem {
  level: "approximate" | "dropped" | "limitation" | "info";
  message: string;
}

export interface ValidationError {
  line?: number;
  message: string;
}

export interface ParseResult<T> {
  data: T;
  warnings: WarningItem[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface RemoteResource {
  url: string;
  kind: "proxy-provider" | "rule-provider" | "policy-path" | "rule-template" | "unknown";
  owner?: string;
  policy?: string;
  enabled?: boolean;
  ruleSetStyle?: "rule-set" | "domain-set";
}

export interface ProxyNode {
  id: string;
  name: string;
  type: ProxyType;
  server?: string;
  port?: number;
  tls?: boolean;
  udp?: boolean;
  cipher?: string;
  username?: string;
  password?: string;
  uuid?: string;
  alterId?: number;
  network?: string;
  sni?: string;
  path?: string;
  host?: string;
  flow?: string;
  security?: string;
  skipCertVerify?: boolean;
  plugin?: string;
  pluginOpts?: Record<string, string>;
  alpn?: string[];
  extra?: Record<string, string>;
  raw?: string;
  source?: string;
}

export interface PolicyGroup {
  name: string;
  type: PolicyGroupType;
  proxies: string[];
  use: string[];
  url?: string;
  interval?: number;
  tolerance?: number;
  filter?: string;
  policyPath?: string;
  extra?: Record<string, string>;
}

export interface Rule {
  type: RuleType;
  value?: string;
  target: string;
  noResolve?: boolean;
  raw?: string;
}

export interface ConfigIR {
  general: Record<string, string>;
  proxies: ProxyNode[];
  policyGroups: PolicyGroup[];
  rules: Rule[];
  remoteResources: RemoteResource[];
  metadata: {
    sourceFormat?: ConfigFormat;
    sourceName?: string;
    ignoredTopLevelSections?: string[];
    ignoredSections?: Partial<Record<"rewrite" | "task" | "mitm" | "serverRemote" | "filterRemote", string[]>>;
    preservedUnsupportedProxies?: string[];
  };
}

export interface ConvertOutput {
  format: ConfigFormat;
  content: string;
  warnings: WarningItem[];
  validation: ValidationResult;
  log: string[];
}

export interface GeneratedProxyLine {
  name: string;
  line: string;
  supported: boolean;
  comment?: string;
}
