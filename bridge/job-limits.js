'use strict';
// Research may not consume the entire route-planning run. A single fresh,
// tools-disabled planning attempt follows a research timeout on the same snapshot.
function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
function timeoutMs(job, cfg) {
  if (job.draftRequest) return 600000;
  if (job.planRequest) return job.planResearch
    ? positive(cfg.plannerResearchTimeoutMs, 90000) : positive(cfg.plannerTimeoutMs, 150000);
  return positive(cfg.timeoutMs, 1800000);
}
function locale(job) { return job.planSnapshot?.player?.locale || job.draftRequest?.locale; }
function retryMessage(job) {
  if (locale(job) === 'enUS') return 'Location lookup took too long. AI is now planning with verified locations; unresolved quests will remain marked as unknown.';
  if (locale(job) === 'zhTW') return '查詢位置耗時過長，AI 正在用已有可靠位置規劃路線；查不到的任務會標明位置待確認。';
  return '查询位置耗时过长，AI 正在用已有可靠位置规划路线；查不到的任务会标明位置待确认。';
}
function timeoutMessage(job, agent, ms) {
  const seconds = Math.ceil(ms / 1000);
  if (locale(job) === 'enUS') return `${agent} did not return a complete result within ${seconds}s (TIMEOUT). The previous route and saved records are unchanged. Retry or select another model.`;
  if (locale(job) === 'zhTW') return `${agent} 在 ${seconds} 秒內未傳回完整結果（TIMEOUT）。原有路線和已保存記錄未改動，可重試或切換模型。`;
  return `${agent} 在 ${seconds} 秒内未返回完整结果（TIMEOUT）。原有路线和已保存记录未改动，可重试或切换模型。`;
}
module.exports = {timeoutMs, retryMessage, timeoutMessage};
