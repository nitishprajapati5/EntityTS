export interface CiConfig {
  $schema?: string;
  enabled?: boolean;
  description?: string;
  triggers?: {
    push?: boolean;
    pull_request?: boolean;
    workflow_dispatch?: boolean;
    schedule?: boolean;
    [key: string]: boolean | undefined;
  };
  pipelines?: {
    ci?: boolean;
    postgres?: boolean;
    mysql?: boolean;
    mssql?: boolean;
    sqlite?: boolean;
    databases?: boolean;
    release?: boolean;
    packageCheck?: boolean;
    docs?: boolean;
    benchmark?: boolean;
    [key: string]: boolean | undefined;
  };
}

export function loadConfig(): CiConfig;
export function saveConfig(config: CiConfig): boolean;
export function setGlobalFlag(enabled: boolean): CiConfig;
export function setTriggerFlag(triggerName: string, enabled: boolean): CiConfig;
export function setPipelineFlag(pipelineName: string, enabled: boolean): CiConfig;
export function checkPipeline(
  pipelineName: string,
  eventName?: string,
): { enabled: boolean; reason: string };
