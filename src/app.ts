import { validatePolicyGraph } from "./domain/graph";
import type { ConfigFormat, ConvertOutput, ValidationResult, WarningItem } from "./domain/types";
import { generateConfig } from "./generators";
import { parseConfig } from "./parsers";
import { detectFormat } from "./parsers/format-detector";
import { fetchRemoteResources } from "./remote/fetcher";
import { integrateRemoteResources } from "./remote/integrator";
import { validateOutput } from "./validators/output";

export interface TransformOptions {
  sourceFormat?: ConfigFormat;
  targetFormat: ConfigFormat;
  expandRemoteRules: boolean;
  expandRemoteProxies: boolean;
}

export interface TransformResult {
  detected: ReturnType<typeof detectFormat>;
  output?: ConvertOutput;
  parseValidation: ValidationResult;
  remoteStatus: string[];
  log: string[];
}

export async function transformConfig(input: string, options: TransformOptions): Promise<TransformResult> {
  const detected = detectFormat(input);
  const log: string[] = [
    `检测结果: ${detected.format ?? "未知"} (${Math.round(detected.confidence * 100)}%) - ${detected.reason}`
  ];

  try {
    const parsed = parseConfig(input, options.sourceFormat);
    log.push(`解析完成: ${parsed.data.proxies.length} 个代理, ${parsed.data.policyGroups.length} 个策略组, ${parsed.data.rules.length} 条规则`);
    let workingConfig = parsed.data;
    const warnings: WarningItem[] = [...parsed.warnings];
    const remoteStatus: string[] = [];

    const remoteResourcesToExpand =
      options.targetFormat === "surge"
        ? workingConfig.remoteResources.filter(
            (resource) =>
              resource.kind === "proxy-provider" ||
              (resource.kind === "rule-provider" &&
                (resource.ruleSetStyle === "domain-set" || options.expandRemoteRules))
          )
        : workingConfig.remoteResources.filter((resource) => {
            if (resource.kind === "rule-provider") {
              return options.expandRemoteRules;
            }
            if (resource.kind === "proxy-provider") {
              return options.expandRemoteProxies;
            }
            return false;
          });

    if (remoteResourcesToExpand.length > 0) {
      log.push(`尝试展开远程资源: ${remoteResourcesToExpand.length} 个`);
      try {
        const results = await fetchRemoteResources(remoteResourcesToExpand);
        results.forEach((result) => {
          if (result.ok) {
            remoteStatus.push(`已拉取: ${result.url}`);
            log.push(`已拉取: ${result.url}`);
          } else {
            remoteStatus.push(`失败: ${result.url} (${result.error})`);
            log.push(`失败: ${result.url} (${result.error})`);
            warnings.push({
              level: "limitation",
              message: `远程资源未展开: ${result.url} (${result.error})`
            });
          }
        });

        const integrated = integrateRemoteResources(
          workingConfig,
          remoteResourcesToExpand,
          results,
          options.targetFormat,
          {
            expandRemoteRules: options.expandRemoteRules,
            expandRemoteProxies: options.expandRemoteProxies
          }
        );
        workingConfig = integrated.ir;
        integrated.notes.forEach((note) => {
          warnings.push({ level: "info", message: note });
          log.push(note);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "远程资源处理失败";
        remoteStatus.push(`失败: ${message}`);
        log.push(`远程展开失败: ${message}`);
        warnings.push({
          level: "limitation",
          message: `远程展开失败，通常是浏览器 CORS 或 file:// 限制: ${message}`
        });
      }
    }

    const graphErrors = validatePolicyGraph(workingConfig);
    if (graphErrors.length > 0) {
      return {
        detected,
        parseValidation: { valid: false, errors: graphErrors },
        remoteStatus
      };
    }

    const generated = generateConfig(workingConfig, options.targetFormat);
    warnings.push(...generated.warnings);
    const validation = validateOutput(options.targetFormat, generated.content);
    log.push(`生成完成: ${options.targetFormat}`);
    log.push(`输出校验: ${validation.valid ? "通过" : "失败"}`);

    return {
      detected,
      parseValidation: { valid: true, errors: [] },
      remoteStatus,
      log,
      output: {
        format: options.targetFormat,
        content: generated.content,
        warnings,
        validation,
        log
      }
    };
  } catch (error) {
    log.push(`失败: ${error instanceof Error ? error.message : "解析失败"}`);
    return {
      detected,
      parseValidation: {
        valid: false,
        errors: [{ message: error instanceof Error ? error.message : "解析失败" }]
      },
      remoteStatus: [],
      log
    };
  }
}
